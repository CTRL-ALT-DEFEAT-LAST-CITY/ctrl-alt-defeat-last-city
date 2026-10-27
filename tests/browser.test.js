// =============================================
// BROWSER INTEGRATION TESTS
// ---------------------------------------------
// Runs the real page in headless Chromium. Static checks cannot tell you
// whether the game actually boots, whether a pre-update save still loads, or
// whether a new module threw during start-up — these can.
//
// Playwright is an optional dev dependency. Without it the whole suite reports
// as SKIPPED rather than failing, so `node tests/run.js` is still useful on a
// clean checkout.
// =============================================

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { suite, assert } = require("./harness");

const ROOT = path.resolve(__dirname, "..");

let playwright = null;
try { playwright = require("playwright"); } catch (_) { playwright = null; }

// Playwright normally ships with a matching browser build. On a machine where
// Chromium was provisioned separately (a CI image, a sandbox, or a repository
// that pins its own copy), the bundled build number can differ and launching
// fails with "Executable doesn't exist". Rather than making the suite depend on
// a download, look for a usable Chromium next to the bundled one and use it.
function findChromium() {
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean);
    const candidates = [];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root)) {
            if (!/^chromium(-|_headless_shell-)?/.test(entry)) continue;
            candidates.push(
                path.join(root, entry, "chrome-linux", "chrome"),
                path.join(root, entry, "chrome-linux", "headless_shell"),
                path.join(root, entry, "chrome-headless-shell-linux64", "chrome-headless-shell")
            );
        }
    }
    return candidates.find(file => fs.existsSync(file)) || null;
}

// ---------------------------------------------------------------
// A tiny static server. The game needs a real http origin: localStorage and
// the dialog/canvas behaviour under file:// are not representative.
// ---------------------------------------------------------------

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif",
    ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".ogg": "audio/ogg"
};

function startServer() {
    return new Promise(resolve => {
        const server = http.createServer((request, response) => {
            const url = decodeURIComponent((request.url || "/").split("?")[0]);
            const relative = url === "/" ? "index.html" : url.replace(/^\/+/, "");
            // Contain every request inside the project directory.
            const target = path.resolve(ROOT, relative);
            if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
                response.writeHead(404, { "content-type": "text/plain" });
                response.end("not found: " + relative);
                return;
            }
            response.writeHead(200, {
                "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
                "cache-control": "no-store"
            });
            fs.createReadStream(target).pipe(response);
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
    });
}

// ---------------------------------------------------------------
// Shared browser fixture
// ---------------------------------------------------------------

let context = null;        // { browser, server, port, baseUrl }

async function boot() {
    if (context) return context;
    const { server, port } = await startServer();
    // The suite must be hermetic: no test may depend on, or wait for, the
    // public internet. These flags stop Chromium's own background traffic
    // (component updates, safe browsing, autofill, sync), which otherwise
    // stalls page loads for seconds at a time on a sandboxed network.
    const launchOptions = {
        args: [
            "--no-sandbox", "--disable-dev-shm-usage", "--mute-audio",
            "--disable-background-networking", "--disable-component-update",
            "--disable-sync", "--disable-default-apps", "--no-first-run",
            "--no-default-browser-check", "--disable-client-side-phishing-detection",
            "--safebrowsing-disable-auto-update", "--metrics-recording-only"
        ]
    };
    let browser;
    try {
        browser = await playwright.chromium.launch(launchOptions);
    } catch (error) {
        const executablePath = findChromium();
        if (!executablePath) throw error;
        browser = await playwright.chromium.launch({ ...launchOptions, executablePath });
    }
    context = { browser, server, port, baseUrl: "http://127.0.0.1:" + port + "/index.html" };
    return context;
}

async function shutdown() {
    if (!context) return;
    await context.browser.close().catch(() => {});
    await new Promise(resolve => context.server.close(resolve));
    context = null;
}

// Opens the page and collects everything that went wrong, so a test can assert
// on a clean console rather than on a symptom.
async function openPage(options = {}) {
    const { baseUrl, browser } = await boot();
    const page = await browser.newPage({
        viewport: options.viewport || { width: 1440, height: 980 },
        reducedMotion: options.reducedMotion || "no-preference"
    });

    // src/cloud/cloud-save.js lazily loads the Supabase SDK from jsdelivr when
    // the player touches an account. Tests must not depend on the public
    // internet, so the request is answered locally with a stub. Cloud login and
    // cloud saving are therefore NOT covered by this suite — that limitation is
    // recorded in TEST_RESULTS.md rather than hidden behind a green tick.
    await page.route("**://cdn.jsdelivr.net/**", route =>
        route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: "window.__supabaseSdkStubbed = true;"
        }));
    // Everything else that is not the local server is refused immediately
    // rather than left to time out. A test that needed the network would be a
    // test that fails on an aeroplane.
    await page.route("**", route => {
        const url = route.request().url();
        if (url.startsWith("http://127.0.0.1:") || url.startsWith("data:") || url.startsWith("blob:")) {
            return route.continue();
        }
        return route.abort();
    });
    const errors = [];
    const warnings = [];
    page.on("console", message => {
        const text = message.text();
        if (message.type() === "error") errors.push(text);
        if (message.type() === "warning") warnings.push(text);
    });
    page.on("pageerror", error => errors.push("pageerror: " + (error && error.message)));
    page.on("requestfailed", request => {
        // A failed asset request is a broken deploy, which is exactly what the
        // user asked never to ship. External requests are deliberately refused
        // by the route handler above, so only local ones count.
        const url = request.url();
        if (!url.startsWith("http://127.0.0.1:")) return;
        errors.push("requestfailed: " + url + " (" + (request.failure()?.errorText || "?") + ")");
    });
    page.on("response", response => {
        if (response.status() >= 400) errors.push("http " + response.status() + ": " + response.url());
    });

    // Seed a save before any script runs, when a test needs one.
    if (options.seedSave) {
        await page.addInitScript(([key, value]) => {
            try { window.localStorage.setItem(key, value); } catch (_) {}
        }, [options.seedSaveKey || "lastCitySaveV2", options.seedSave]);
    }

    await page.goto(baseUrl, { waitUntil: "load" });
    // Let the deferred expansion init and the first render settle.
    await page.waitForFunction(() => !!window.LastCityExpansion, null, { timeout: 10000 });
    await page.waitForTimeout(260);

    page.__errors = errors;
    page.__warnings = warnings;
    return page;
}

// Dismisses the start screen and the terminal boot animation so tests act on
// the live game rather than on the title card.
async function startGame(page) {
    await page.evaluate(() => {
        // PLAY shows the opening cinematic to a first-time player. Tests that
        // cover the cinematic do so explicitly; everywhere else behaves like a
        // returning player so the start is deterministic and fast.
        const state = window.LastCityExpansion?.state();
        if (state) state.cinematic.seenVersion = 99;
        // Story popups are an original feature that interrupts an automated
        // run; the Settings toggle turns them off the same way.
        if (window.LastCityGame) {
            try { window.eval("game.storyPopupsEnabled = false;"); } catch (_) {}
        }
        document.getElementById("introStartButton")?.click();
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => {
        // Skip the boot sequence deterministically rather than waiting it out.
        if (typeof finishTerminalBoot === "function") finishTerminalBoot(false, false);
        document.querySelector(".offline-modal .offline-close-btn")?.click();
    });
    // `gameStarted` is a top-level `let` in src/ui/player-ui.js, so it is a
    // global lexical binding and NOT a property of window. It has to be read
    // as a bare identifier.
    await page.waitForFunction(
        () => { try { return typeof gameStarted !== "undefined" && gameStarted === true; } catch (_) { return false; } },
        null, { timeout: 8000 });
    await page.waitForTimeout(140);
}

// Errors we accept, because they come from the sandbox rather than the game.
const IGNORABLE = [
    /AudioContext was not allowed to start/i,
    /The AudioContext was not allowed/i,
    /play\(\) failed because the user/i,
    /Autoplay is only allowed/i,
    // Deliberately blocked by the route handler above: the tests run offline.
    /cdn\.jsdelivr\.net/i,
    /supabase/i,
    /net::ERR_FAILED/i,
    /ERR_BLOCKED_BY_CLIENT/i
];

function realErrors(page) {
    return (page.__errors || []).filter(text => !IGNORABLE.some(pattern => pattern.test(text)));
}

// ---------------------------------------------------------------
// Suites
// ---------------------------------------------------------------

if (!playwright) {
    suite("Browser · integration", ({ skip }) => {
        const reason = "Playwright is not installed (npm i -D playwright, then npx playwright install chromium)";
        for (const name of [
            "the page loads with a clean console",
            "the game starts",
            "gathering Salvage still works",
            "buying a building still works",
            "save and reload preserves progress",
            "a pre-update save loads without losing progress",
            "every expansion mode opens",
            "the service HUD appears once the city is used",
            "production is unchanged for a save with no expansion progress",
            "the layout works at phone width"
        ]) skip(name, reason);
    });
} else {

suite("Browser · boot and original gameplay", ({ test }) => {
    test("the page loads with a clean console and no failed requests", async () => {
        const page = await openPage();
        const errors = realErrors(page);
        assert.deepEqual(errors, [], "console errors / failed requests on load");
        await page.close();
    });

    test("every script and stylesheet actually loaded", async () => {
        const page = await openPage();
        const missing = await page.evaluate(() => {
            const out = [];
            for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
                // A stylesheet that 404s has no cssRules and no sheet.
                if (!link.sheet) out.push("css: " + link.getAttribute("href"));
            }
            return out;
        });
        assert.deepEqual(missing, [], "stylesheets that did not parse");

        // Each expansion module should have registered itself.
        const registered = await page.evaluate(() =>
            ["city", "combat", "research", "cinematic", "pets", "events"]
                .filter(name => !window.LastCityExpansion.moduleFor(name)));
        assert.deepEqual(registered, [], "modules that failed to register");
        await page.close();
    });

    test("the game starts from the title screen", async () => {
        const page = await openPage();
        await startGame(page);
        assert.equal(await page.evaluate(() => gameStarted), true);
        assert.deepEqual(realErrors(page), [], "errors during start-up");
        await page.close();
    });

    test("gathering Salvage still works", async () => {
        const page = await openPage();
        await startGame(page);
        const before = await page.evaluate(() => game.salvage);
        await page.evaluate(() => {
            for (let i = 0; i < 5; i++) document.getElementById("energyButton").click();
        });
        const after = await page.evaluate(() => ({ salvage: game.salvage, clicks: game.totalClicks }));
        assert.ok(after.salvage > before, "salvage should rise when gathering");
        assert.ok(after.clicks >= 5, "clicks should be counted");
        await page.close();
    });

    test("buying a building still works and is reflected in the rate", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            game.salvage = 1e6;
            updateGame();
            const rateBefore = getSalvagePerSecond();
            document.getElementById("buyScavenger").click();
            return { owned: game.buildings.scavenger, rateBefore, rateAfter: getSalvagePerSecond() };
        });
        assert.ok(result.owned >= 1, "a camp should have been built");
        assert.ok(result.rateAfter > result.rateBefore, "passive income should increase");
        await page.close();
    });

    test("the five production rates stay finite with heavy progress", async () => {
        const page = await openPage();
        await startGame(page);
        const rates = await page.evaluate(() => {
            // Unlock everything and push levels high, which is where a NaN or
            // an Infinity would surface.
            for (const stage of [2, 3, 4, 5]) game["stage" + stage + "Unlocked"] = true;
            game.rebirths = 40;
            game.cityTech.salvageAccelerator = 40;
            game.cityTech.sturdyGloves = 40;
            for (const stage of [2, 3, 4, 5]) {
                const board = game["stage" + stage + "Upgrades"];
                for (const key of Object.keys(board)) board[key] = 20;
                const permanent = game["stage" + stage + "ResetUpgrades"];
                for (const key of Object.keys(permanent)) permanent[key] = 10;
                game["stage" + stage + "Resets"] = 25;
            }
            updateGame();
            return {
                salvage: getSalvagePerSecond(),
                scrap: getScrapPerSecond(),
                parts: getPartsPerSecond(),
                circuits: getCircuitsPerSecond(),
                cores: getCoresPerSecond(),
                click: getClickPower(),
                drop: getSupplyDropValue()
            };
        });
        for (const [key, value] of Object.entries(rates)) {
            assert.ok(Number.isFinite(value) && value > 0, key + " is not a finite positive number: " + value);
        }
        await page.close();
    });
});

suite("Browser · saves", ({ test }) => {
    test("save and reload preserves progress", async () => {
        const page = await openPage();
        await startGame(page);
        const saved = await page.evaluate(() => {
            game.salvage = 12345;
            game.buildings.scavenger = 7;
            game.totalClicks = 99;
            game.stage2Unlocked = true;
            game.adventure.collection["1-3"] = 2;
            saveGame(false);
            return localStorage.getItem(getSaveKey());
        });
        assert.ok(saved && saved.length > 100, "a save should have been written");

        await page.reload({ waitUntil: "load" });
        await page.waitForFunction(
            () => { try { return !!window.LastCityExpansion && typeof game !== "undefined" && !!game; } catch (_) { return false; } },
            null, { timeout: 10000 });
        const restored = await page.evaluate(() => ({
            scavenger: game.buildings.scavenger,
            clicks: game.totalClicks,
            stage2: game.stage2Unlocked,
            pet: game.adventure.collection["1-3"],
            hasExpansion: !!game.expansion
        }));
        assert.equal(restored.scavenger, 7);
        assert.equal(restored.clicks, 99);
        assert.equal(restored.stage2, true);
        assert.equal(restored.pet, 2);
        assert.equal(restored.hasExpansion, true, "the expansion section should be backfilled on load");
        await page.close();
    });

    test("a pre-update save loads with no loss and no errors", async () => {
        // This is the most important test in the file: the shape below is what a
        // save written by the PREVIOUS build looks like. It has no `expansion`
        // key at all, and must load into a fully playable game.
        const legacy = JSON.stringify({
            lastSeen: Date.now() - 1000,
            salvage: 48000, clickPower: 1, totalClicks: 4210, totalSalvage: 99000,
            lifetimeSalvage: 250000, playTimeSeconds: 7400,
            buildings: { scavenger: 42, shelter: 18, workshop: 6, power: 2, citycenter: 1, yard: 9, farm: 4, factory: 2 },
            cityTech: { sturdyGloves: 12, salvageAccelerator: 9, salvageMagnet: 3, dropScanner: 2, critChance: 4, pulseTool: 5 },
            shards: 22, rebirths: 3,
            rebirthUpgrades: { efficient: 6, headStart: 1, cheapBuild: 2 },
            stage2Unlocked: true, scrap: 9000, scrapTokens: 11, stage2Resets: 2,
            stage2Upgrades: { scrapRate: 14, salvageBoost: 5, survivorSpeed: 8, scrapStorage: 1 },
            stage3Unlocked: true, parts: 2400, partTokens: 4,
            stage3Upgrades: { partRate: 9, assemblySpeed: 6, autoAssembly: 1 },
            adventure: {
                keys: 5, deliveries: 24, siteSearches: [14, 14, 8],
                collection: { "1-0": 4, "1-2": 1, "2-1": 3, "3-4": 1 },
                equipped: { 1: ["1-2", "1-0"], 2: ["2-1"] },
                bossHealth: 100, bossDefeated: false,
                progression: { beaconModules: 3, infrastructure: { depotCamp: 4, sortingMill: 2, assemblyLine: 3 }, fieldCollected: 12 }
            },
            // A save written by the previous build carries version 3 glyph
            // data. src/game/glyphs.js only reads a `research` block from a
            // version-3 save — an older save reconstructs research from
            // per-zone fields instead — so the version marker is part of what
            // makes this fixture realistic rather than a detail.
            glyphs: { version: 3, research: { luck: 3, more: 1, speed: 2 }, selected: 2, view: "roll" },
            achievements: { handsOn: true, settlement: true, skyline: true, reborn: true },
            contractsClaimed: { firstShift: true, campNetwork: true },
            soundEnabled: true, introSeen: true, lastStageView: 3
        });

        const page = await openPage({ seedSave: legacy });
        const state = await page.evaluate(() => ({
            salvage: game.salvage,
            scavenger: game.buildings.scavenger,
            legacyYard: game.buildings.yard,
            clicks: game.totalClicks,
            rebirths: game.rebirths,
            shards: game.shards,
            stage2: game.stage2Unlocked,
            stage3: game.stage3Unlocked,
            scrapRate: game.stage2Upgrades.scrapRate,
            pets: { ...game.adventure.collection },
            equipped1: (game.adventure.equipped[1] || []).slice(),
            beacon: game.adventure.progression.beaconModules,
            depotCamp: game.adventure.progression.infrastructure.depotCamp,
            glyphLuck: game.glyphs.research.luck,
            achievements: Object.keys(game.achievements).filter(k => game.achievements[k]),
            // The expansion must have been created from nothing:
            expansionVersion: game.expansion?.version,
            plots: game.expansion?.city.plots.length,
            // And legacy economy credit must have been computed:
            legacyOutput: game.economy.legacyOutput > 0
        }));

        assert.ok(state.salvage >= 48000, "Salvage should be at least what was saved (offline progress may add)");
        // 42 Scavenger Camps predate the cap of 30. Normalization brings a
        // building line down to what this build can actually reach, which is
        // the contract: progression is kept, impossible values are not.
        assert.equal(state.scavenger, 30, "a building line above its maximum is brought down to it");
        assert.equal(state.legacyYard, 9, "retired legacy buildings must still be present");
        assert.equal(state.clicks, 4210);
        assert.equal(state.rebirths, 3);
        assert.equal(state.shards, 22);
        assert.equal(state.stage2, true);
        assert.equal(state.stage3, true);
        assert.equal(state.scrapRate, 14, "upgrade levels must survive");
        assert.equal(state.pets["1-0"], 4, "pet collection must survive");
        assert.equal(state.pets["3-4"], 1);
        assert.deepEqual(state.equipped1, ["1-2", "1-0"], "equipped companions must survive");
        assert.equal(state.beacon, 3, "beacon modules must survive");
        assert.equal(state.depotCamp, 4, "kept-on-reset infrastructure must survive");
        assert.equal(state.glyphLuck, 3, "glyph research must survive");
        // The original game awards any achievement the save already qualifies
        // for the moment it loads, so the count legitimately GROWS. What must
        // never happen is an already-earned badge disappearing.
        for (const earned of ["handsOn", "settlement", "skyline", "reborn"]) {
            assert.includes(state.achievements, earned, "achievement must survive: " + earned);
        }
        assert.ok(state.legacyOutput, "legacy building output should still be credited");
        assert.ok(state.expansionVersion >= 1, "the expansion section should be created for an old save");
        assert.equal(state.plots, 0, "an old save starts with an empty city layout");
        assert.deepEqual(realErrors(page), [], "errors while loading a pre-update save");
        await page.close();
    });

    test("a much older glyph save is upgraded rather than discarded", async () => {
        // Before version 3, glyph research lived on each zone as `more`,
        // `speed` and `luck`, and counts were stored one per tier rather than
        // one per glyph. The original normalizer rebuilds the modern shape
        // from those fields; this guards that path for players who have not
        // opened the game in a long time.
        const ancient = JSON.stringify({
            salvage: 500, totalClicks: 90, introSeen: true,
            buildings: { scavenger: 3 },
            glyphs: {
                zones: {
                    1: { counts: [2, 1, 0, 0, 0], rolls: 14, luck: 4, more: 2, speed: 1, resonance: 3, essence: 40 },
                    2: { counts: [1, 0, 0, 0, 0], rolls: 3, luck: 2, more: 0, speed: 0 }
                }
            }
        });
        const page = await openPage({ seedSave: ancient });
        const state = await page.evaluate(() => ({
            version: game.glyphs.version,
            luck: game.glyphs.research.luck,
            more: game.glyphs.research.more,
            legacyBuffs: { ...game.glyphs.legacyBuffs },
            counts1: game.glyphs.zones[1].counts.slice(0, 4)
        }));
        assert.equal(state.version, 3, "the glyph block is upgraded to the current version");
        assert.ok(state.luck >= 6, "per-zone luck research is summed into the modern field");
        assert.ok(state.more >= 2, "per-zone draw research is carried across");
        assert.ok(state.legacyBuffs["1"] > 1, "already-earned glyph power is preserved as a floor");
        assert.deepEqual(realErrors(page), [], "console errors while loading an ancient save");
        await page.close();
    });

    test("a save written by this build still parses if expansion data is stripped", async () => {
        // Forward/backward compatibility: an older build would simply drop the
        // unknown key, and the result must still be a valid save here.
        const page = await openPage();
        await startGame(page);
        const ok = await page.evaluate(() => {
            game.salvage = 500;
            game.buildings.scavenger = 3;
            saveGame(false);
            const raw = JSON.parse(localStorage.getItem(getSaveKey()));
            delete raw.expansion;
            localStorage.setItem(getSaveKey(), JSON.stringify(raw));
            loadGame();
            return game.buildings.scavenger === 3 && !!game.expansion;
        });
        assert.ok(ok, "a save with expansion data removed should reload and be repaired");
        await page.close();
    });

    test("a corrupted expansion section is repaired rather than fatal", async () => {
        const page = await openPage();
        await startGame(page);
        const ok = await page.evaluate(() => {
            const raw = JSON.parse(localStorage.getItem(getSaveKey()) || "{}");
            raw.buildings = { scavenger: 5 };
            raw.expansion = { version: "nonsense", city: { plots: "not an array" }, research: 42, pets: null };
            localStorage.setItem(getSaveKey(), JSON.stringify(raw));
            loadGame();
            return {
                scavenger: game.buildings.scavenger,
                plots: Array.isArray(game.expansion.city.plots),
                research: typeof game.expansion.research === "object"
            };
        });
        assert.equal(ok.scavenger, 5, "the original save data should be untouched by expansion corruption");
        assert.ok(ok.plots, "plots should be repaired to an array");
        assert.ok(ok.research, "research should be repaired to an object");
        assert.deepEqual(realErrors(page), []);
        await page.close();
    });
});

suite("Browser · expansion integration", ({ test }) => {
    test("production is unchanged for a save with no expansion progress", async () => {
        // The guarantee: expansionProductionMultiplier() returns exactly 1 until
        // the player has earned something, so the original curves are intact.
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const before = {
                s: getSalvagePerSecond(), click: getClickPower()
            };
            return {
                multipliers: [1, 2, 3, 4, 5].map(stage => expansionProductionMultiplier(stage)),
                dropBonus: expansionSupplyDropBonus(),
                before
            };
        });
        assert.deepEqual(result.multipliers, [1, 1, 1, 1, 1],
            "a fresh save must not receive any expansion multiplier");
        assert.equal(result.dropBonus, 1, "no depots means no supply-drop bonus");
        await page.close();
    });

    test("every expansion mode opens without errors", async () => {
        const page = await openPage();
        await startGame(page);
        // Unlock the gated modes so all three can be exercised.
        await page.evaluate(() => {
            game.stage2Unlocked = true;
            game.stage3Unlocked = true;
            updateGame();
        });
        for (const mode of ["build", "combat", "research"]) {
            const opened = await page.evaluate(m => {
                switchGameMode(m);
                return {
                    mode: currentGameMode,
                    bodyClass: document.body.classList.contains(m + "-open")
                };
            }, mode);
            assert.equal(opened.mode, mode, "mode did not switch to " + mode);
            assert.ok(opened.bodyClass, "body class missing for " + mode);
            await page.waitForTimeout(90);
        }
        // And back to the original modes, which must still work.
        for (const mode of ["city", "upgrades", "glyphs", "companions", "stories", "stats"]) {
            const current = await page.evaluate(m => { switchGameMode(m); return currentGameMode; }, mode);
            assert.equal(current, mode, "original mode " + mode + " broke");
        }
        assert.deepEqual(realErrors(page), [], "errors while switching modes");
        await page.close();
    });

    test("a locked mode refuses to open", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            game.stage2Unlocked = false;
            game.stage3Unlocked = false;
            game.expansion.research.lifetimePoints = 0;
            game.expansion.city.plots = [];
            updateGame();
            switchGameMode("city");
            switchGameMode("combat");
            return currentGameMode;
        });
        assert.equal(result, "city", "a locked mode must not become the active mode");
        await page.close();
    });

    test("the service HUD stays hidden until the city is used", async () => {
        const page = await openPage();
        await startGame(page);
        const hiddenAtFirst = await page.evaluate(() =>
            document.getElementById("cityServiceHud").hidden);
        assert.equal(hiddenAtFirst, true, "a brand-new player should not see the services strip");
        await page.close();
    });

    test("the tutorial coach advances with real progress", async () => {
        const page = await openPage();
        await startGame(page);
        const first = await page.evaluate(() => {
            const step = window.LastCityExpansion.currentTutorialStep();
            return step && step.id;
        });
        assert.equal(first, "gather", "the first step should be gathering");

        const second = await page.evaluate(() => {
            for (let i = 0; i < 12; i++) document.getElementById("energyButton").click();
            updateGame();
            const step = window.LastCityExpansion.currentTutorialStep();
            return step && step.id;
        });
        assert.equal(second, "firstCamp", "the step should advance once the player has gathered");
        await page.close();
    });

    test("the audio engine exposes its tracks and effects without a gesture", async () => {
        const page = await openPage();
        const audio = await page.evaluate(() => ({
            available: window.LastCityAudio.available(),
            tracks: window.LastCityAudio._trackNames(),
            sfxCount: window.LastCityAudio._sfxNames().length
        }));
        assert.ok(audio.tracks.length >= 4, "expected several music tracks");
        assert.ok(audio.sfxCount >= 20, "expected a full effects library, got " + audio.sfxCount);
        await page.close();
    });
});

suite("Browser · presentation", ({ test }) => {
    test("the layout works at phone width with no horizontal scroll", async () => {
        const page = await openPage({ viewport: { width: 390, height: 844 } });
        await startGame(page);
        const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
        }));
        // A couple of pixels of rounding is fine; a real overflow is not.
        assert.ok(overflow.scrollWidth <= overflow.clientWidth + 2,
            "horizontal overflow at 390px: " + overflow.scrollWidth + " > " + overflow.clientWidth);
        await page.close();
    });

    test("reduced-motion preference is respected", async () => {
        const page = await openPage({ reducedMotion: "reduce" });
        await startGame(page);
        const motion = await page.evaluate(() => ({
            canPlay: typeof canPlayVfx === "function" ? canPlayVfx() : null,
            expansionMotion: window.LastCityExpansion.motionAllowed()
        }));
        assert.equal(motion.canPlay, false, "the original effects gate should be off under reduced motion");
        assert.equal(motion.expansionMotion, false, "the expansion motion gate should agree");
        await page.close();
    });

    test("an idle minute of game loop produces no errors", async () => {
        const page = await openPage();
        await startGame(page);
        // Unlock everything so every renderer and automation path runs.
        await page.evaluate(() => {
            for (const stage of [2, 3, 4, 5]) game["stage" + stage + "Unlocked"] = true;
            game.salvage = 1e9; game.scrap = 1e6; game.parts = 1e6; game.circuits = 1e6; game.cores = 1e6;
            game.stage2Upgrades.scrapStorage = 1;
            game.stage3Upgrades.autoAssembly = 1;
            game.stage4Upgrades.autoNetwork = 1;
            game.stage5Upgrades.autoCore = 1;
            updateGame();
        });
        await page.waitForTimeout(6000);
        assert.deepEqual(realErrors(page), [], "errors during idle simulation");
        await page.close();
        await shutdown();
    });
});


// ---------------------------------------------------------------
// The systems this update adds. Each test drives the module's real public
// surface rather than poking at its internals, so a passing test means the
// feature works the way a player would use it.
// ---------------------------------------------------------------

// Gives the page a playable amount of Salvage and opens the later zones, so a
// test can exercise content without grinding for it.
async function enrich(page, options = {}) {
    await page.evaluate(opts => {
        game.salvage = opts.salvage ?? 5e6;
        game.buildings.shelter = opts.shelters ?? 8;
        if (opts.stage2 !== false) game.stage2Unlocked = true;
        if (opts.stage3) game.stage3Unlocked = true;
        game.storyPopupsEnabled = false;
        document.getElementById("loreModal")?.close?.();
        updateGame();
    }, options);
}

suite("Browser · cinematic opening", ({ test }) => {
    test("a first-time player sees it, and Skip hands control back to the game", async () => {
        const page = await openPage();
        // Deliberately NOT using startGame(): this is the one place the
        // first-run path matters.
        await page.evaluate(() => document.getElementById("introStartButton").click());
        await page.waitForFunction(
            () => window.LastCityExpansion.moduleFor("cinematic").isRunning(),
            null, { timeout: 5000 });

        const during = await page.evaluate(() => ({
            open: document.getElementById("cinematicStage")?.open === true,
            // It must be a <dialog>: the game's start screen is itself a modal
            // dialog in the browser's top layer, and a plain div would render
            // behind it and be unclickable.
            isDialog: document.getElementById("cinematicStage")?.tagName === "DIALOG",
            started: (() => { try { return gameStarted; } catch (_) { return "throw"; } })()
        }));
        assert.ok(during.open, "the cinematic stage should be open");
        assert.ok(during.isDialog, "the cinematic must be a <dialog> to sit above the start screen");
        assert.equal(during.started, false, "the game should not start until the cinematic is done");

        await page.click("#cineSkip");
        await page.waitForFunction(
            () => { try { return typeof gameStarted !== "undefined" && gameStarted === true; } catch (_) { return false; } },
            null, { timeout: 8000 });
        const after = await page.evaluate(() => ({
            running: window.LastCityExpansion.moduleFor("cinematic").isRunning(),
            seen: window.LastCityExpansion.state().cinematic.seenVersion,
            skipped: window.LastCityExpansion.state().cinematic.skipped
        }));
        assert.notOk(after.running, "skipping must end the sequence");
        assert.ok(after.seen >= 1, "the cinematic must be marked as seen");
        assert.ok(after.skipped, "skipping is recorded");
        assert.deepEqual(realErrors(page), []);
        await page.close();
    });

    test("a returning player goes straight into the game", async () => {
        const page = await openPage();
        await page.evaluate(() => {
            window.LastCityExpansion.state().cinematic.seenVersion = 99;
            document.getElementById("introStartButton").click();
        });
        await page.waitForTimeout(400);
        const state = await page.evaluate(() => ({
            running: window.LastCityExpansion.moduleFor("cinematic").isRunning(),
            auto: window.LastCityExpansion.moduleFor("cinematic").shouldAutoPlay()
        }));
        assert.notOk(state.running, "a returning player must not be shown the cinematic again");
        assert.notOk(state.auto);
        await page.close();
    });

    test("every scene draws without error and the script is complete", async () => {
        const page = await openPage();
        const info = await page.evaluate(async () => {
            const cinematic = window.LastCityExpansion.moduleFor("cinematic");
            cinematic.play({ replay: true });          // not awaited: it resolves only at the end
            await new Promise(resolve => setTimeout(resolve, 200));
            const scenes = cinematic._scenes;
            let offset = 0;
            const drawn = [];
            for (const scene of scenes) {
                window.__cineSeek(offset + scene.ms * 0.5);
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                drawn.push(scene.id);
                offset += scene.ms;
            }
            const lines = cinematic._lines;
            cinematic._finish("test");
            return {
                drawn,
                sceneCount: scenes.length,
                lineCount: lines.length,
                everyLineHasText: lines.every(line => typeof line.text === "string" && line.text.length > 4),
                totalMs: cinematic._totalMs
            };
        });
        assert.equal(info.sceneCount, 5, "the opening has five scenes");
        assert.deepEqual(info.drawn, ["before", "collapse", "winter", "survivors", "title"]);
        assert.ok(info.lineCount >= 12, "the script should carry the story, got " + info.lineCount + " lines");
        assert.ok(info.everyLineHasText);
        assert.ok(info.totalMs > 45000, "the sequence should run for roughly a minute");
        assert.deepEqual(realErrors(page), []);
        await page.close();
    });
});

suite("Browser · city builder", ({ test }) => {
    test("placing an owned building consumes it from the tray and does not charge twice", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const EX = window.LastCityExpansion;
            // Buy one through the ORIGINAL purchase path.
            game.buyAmount = 1;
            buyBuilding("scavenger");
            const ownedAfterBuy = game.buildings.scavenger;
            const unplacedBefore = EX.unplacedCount("scavenger");
            const salvageBefore = game.salvage;
            const placed = city._place("scavenger", 0, 0);
            return {
                ownedAfterBuy,
                unplacedBefore,
                placed,
                unplacedAfter: EX.unplacedCount("scavenger"),
                ownedAfterPlace: game.buildings.scavenger,
                chargedAgain: salvageBefore - game.salvage,
                plots: EX.state().city.plots.length
            };
        });
        assert.equal(result.ownedAfterBuy, 1, "the original purchase path still works");
        assert.equal(result.unplacedBefore, 1);
        assert.ok(result.placed, "placing an owned building should succeed");
        assert.equal(result.unplacedAfter, 0, "placing consumes the unplaced copy");
        assert.equal(result.ownedAfterPlace, 1, "placing must not change how many you own");
        assert.equal(result.chargedAgain, 0, "placing an already-bought building is free");
        assert.equal(result.plots, 1);
        await page.close();
    });

    test("footprints cannot overlap and locked districts refuse construction", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const first = city._place("workshop", 0, 0);       // 2x2
            const overlap = city._place("farm", 1, 1);         // would share a cell
            const clear = city._place("farm", 4, 4);
            // Far outside the opened district.
            const locked = city._canPlace("farm", -12, -12);
            return { first, overlap, clear, lockedOk: locked.ok, lockedReason: locked.reason };
        });
        assert.ok(result.first, "a 2x2 building should place on clear ground");
        assert.notOk(result.overlap, "an overlapping footprint must be refused");
        assert.ok(result.clear, "a clear 2x2 area should still accept it");
        assert.notOk(result.lockedOk, "a locked district must refuse construction");
        assert.includes(String(result.lockedReason), "not open");
        await page.close();
    });

    test("demolishing an original building returns it to the tray instead of destroying it", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const EX = window.LastCityExpansion;
            game.buildings.shelter = 3;
            city._place("shelter", 0, 0);
            const plot = EX.state().city.plots[0];
            const ownedBefore = game.buildings.shelter;
            city._demolish(plot.id);
            return {
                ownedBefore,
                ownedAfter: game.buildings.shelter,
                unplaced: EX.unplacedCount("shelter"),
                plots: EX.state().city.plots.length
            };
        });
        assert.equal(result.ownedAfter, result.ownedBefore, "demolishing must never reduce what you own");
        assert.equal(result.plots, 0);
        assert.equal(result.unplaced, 3, "the building goes back to the tray");
        await page.close();
    });

    test("services drive power, food, security and efficiency", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const EX = window.LastCityExpansion;
            const empty = EX.cityStats();
            game.buildings.workshop = 1;
            city._place("workshop", 0, 0);                    // consumes power
            // A building site draws nothing until it is finished, which is why
            // construction has to complete before the grid is measured.
            for (const plot of EX.state().city.plots) plot.constructing = null;
            const brownout = EX.cityStats();
            game.buildings.power = 1;
            city._place("power", 4, 0);                       // supplies power
            city._place("farm", -4, 0);                       // food
            city._place("turret", 2, 3);                      // security
            for (const plot of EX.state().city.plots) plot.constructing = null;
            const supplied = EX.cityStats();
            return {
                emptyEfficiency: empty.efficiency,
                brownoutPowered: brownout.powered,
                suppliedPowered: supplied.powered,
                food: supplied.foodProduced,
                security: supplied.security,
                efficiency: supplied.efficiency
            };
        });
        assert.equal(result.emptyEfficiency, 1, "an empty city is neutral, never a penalty");
        assert.notOk(result.brownoutPowered, "a workshop with no plant should brown out");
        assert.ok(result.suppliedPowered, "a power plant should restore the grid");
        assert.ok(result.food > 0, "a farm should produce food");
        assert.ok(result.security > 0, "a turret should produce security");
        assert.inRange(result.efficiency, 0.3, 1.3);
        await page.close();
    });

    test("a badly-run city costs at most 10% of the original production rate", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const city = EX.moduleFor("city");
            const clean = expansionProductionMultiplier(1);
            // Build a deliberately terrible city: heavy consumers, no power,
            // no food. This is the worst case the clamp has to hold.
            game.buildings.workshop = 4;
            game.buildings.citycenter = 1;
            city._place("workshop", 0, 0);
            city._place("workshop", 3, 0);
            city._place("workshop", -3, 0);
            city._place("citycenter", 0, 4);
            for (const plot of EX.state().city.plots) plot.constructing = null;
            const stats = EX.cityStats();
            return {
                clean,
                worst: expansionProductionMultiplier(1),
                internalEfficiency: stats.efficiency,
                powered: stats.powered
            };
        });
        assert.equal(result.clean, 1, "an untouched save is exactly neutral");
        assert.notOk(result.powered, "the fixture should be in a brownout");
        assert.ok(result.internalEfficiency < 0.9,
            "the city itself should feel the brownout, got " + result.internalEfficiency);
        assert.ok(result.worst >= 0.9,
            "the original economy must never lose more than 10%, got " + result.worst);
        assert.ok(result.worst < 1, "but it should still cost something");
        await page.close();
    });

    test("survivors appear with population and can be assigned to real posts", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const EX = window.LastCityExpansion;
            game.buildings.workshop = 1;
            city._place("workshop", 0, 0);
            for (const plot of EX.state().city.plots) plot.constructing = null;
            city._syncRoster();
            const roster = EX.state().survivors.roster.length;
            const before = EX.cityStats();
            city._autoAssign();
            const after = EX.cityStats();
            return {
                roster, population: getPopulation(),
                idleBefore: before.idle, workersAfter: after.workers,
                engineerSlots: after.jobSlots.engineer
            };
        });
        assert.ok(result.roster > 0, "shelters should produce survivors");
        assert.ok(result.roster <= result.population, "the roster can never exceed Population");
        assert.ok(result.engineerSlots > 0, "a workshop offers engineer posts");
        assert.ok(result.workersAfter > 0, "auto-assign should fill posts");
        await page.close();
    });

    test("roads are stored once, whichever way they are placed", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const EX = window.LastCityExpansion;
            city._place("road", 0, 0);
            city._setTool("road");
            city._place("road", 1, 0);
            return {
                roads: EX.state().city.roads.length,
                // A road must never become a building plot.
                roadPlots: EX.state().city.plots.filter(p => p.type === "road").length
            };
        });
        assert.equal(result.roads, 2, "both placement paths add a road");
        assert.equal(result.roadPlots, 0, "roads are never stored as building plots");
        await page.close();
    });

    test("a raid damages structures and repair restores them for Salvage", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const city = window.LastCityExpansion.moduleFor("city");
            const EX = window.LastCityExpansion;
            game.buildings.shelter = 2;
            city._place("shelter", 0, 0);
            for (const plot of EX.state().city.plots) plot.constructing = null;
            const hits = city.applyRaidDamage(60);
            const damaged = EX.state().city.plots[0].hp;
            const salvageBefore = game.salvage;
            const plotId = EX.state().city.plots[0].id;
            EX.moduleFor("city")._view.selectedPlot = plotId;
            // Repair through the module's own action.
            const repaired = window.LastCityExpansion.moduleFor("city");
            void repaired;
            const panel = document.querySelector('[data-city-action="repair"]');
            if (panel) panel.click();
            return { hits, damaged, repairedHp: EX.state().city.plots[0].hp, spent: salvageBefore - game.salvage };
        });
        assert.ok(result.hits > 0, "a raid should damage something");
        assert.ok(result.damaged < 100, "the structure takes real damage");
        await page.close();
    });
});

suite("Browser · defense", ({ test }) => {
    test("city defenses become tower strength, and a wave can be fought and won", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const city = EX.moduleFor("city");
            const combat = EX.moduleFor("combat");
            const bare = combat.cityDefense();
            city._place("turret", 2, 2);
            city._place("turret", 3, 3);
            city._place("wall", 0, 2);
            for (const plot of EX.state().city.plots) plot.constructing = null;
            const fortified = combat.cityDefense();

            const started = combat.startBattle({ wave: 1 });
            const battle = combat._battle;
            battle.charge = 10;
            const deployed = combat.deployUnit("scrapper", 1);
            const chargeAfter = battle.charge;
            // Run the fight to a conclusion deterministically.
            for (let i = 0; i < 40000 && battle.active; i++) {
                battle.charge = 10;
                if (i % 150 === 0) { combat.deployUnit("scrapper", i % 3); combat.deployUnit("rifleman", (i + 1) % 3); }
                combat._step();
            }
            const state = EX.state();
            return {
                bareTowerHp: bare.towerHp, fortifiedTowerHp: fortified.towerHp,
                started, deployed, chargeAfter,
                result: battle.result,
                wavesCleared: state.combat.wavesCleared,
                rewarded: Object.keys(state.combat.rewarded),
                research: state.research.points
            };
        });
        assert.ok(result.fortifiedTowerHp > result.bareTowerHp, "turrets and walls must strengthen the defense");
        assert.ok(result.started, "a battle should start");
        assert.ok(result.deployed, "a unit should deploy");
        assert.ok(result.chargeAfter < 10, "deploying spends charge");
        assert.equal(result.result, "win", "wave 1 should be winnable with a defended city");
        assert.equal(result.wavesCleared, 1);
        assert.includes(result.rewarded, "wave1");
        assert.ok(result.research > 0, "a cleared wave pays research");
        await page.close();
    });

    test("a wave's first-clear reward is paid exactly once", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const combat = EX.moduleFor("combat");
            const state = EX.state();
            const salvageBefore = game.salvage;
            // Simulate winning wave 1 twice through the real reward path.
            combat._battle.wave = 1;
            combat._battle.endless = false;
            combat._battle.active = true;
            combat.endBattle("win");
            const firstGain = game.salvage - salvageBefore;
            const midpoint = game.salvage;
            combat._battle.wave = 1;
            combat._battle.active = true;
            combat.endBattle("win");
            const secondGain = game.salvage - midpoint;
            return { firstGain, secondGain, rewarded: Object.keys(state.combat.rewarded) };
        });
        assert.ok(result.firstGain > 0, "the first clear pays out");
        assert.ok(result.secondGain < result.firstGain,
            "a replay must pay less than the first clear (got " + result.secondGain + " vs " + result.firstGain + ")");
        assert.deepEqual(result.rewarded, ["wave1"]);
        await page.close();
    });

    test("waves are deterministic and bosses arrive on schedule", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const combat = window.LastCityExpansion.moduleFor("combat");
            const a = combat.waveComposition(7).map(s => s.id + "@" + s.at).join(",");
            const b = combat.waveComposition(7).map(s => s.id + "@" + s.at).join(",");
            return {
                deterministic: a === b,
                bossAt5: combat.waveBoss(5),
                bossAt4: combat.waveBoss(4),
                bossAt10: combat.waveBoss(10),
                wave1Size: combat.waveComposition(1).length,
                wave9Size: combat.waveComposition(9).length
            };
        });
        assert.ok(result.deterministic, "the same wave number must always produce the same wave");
        assert.equal(result.bossAt4, null);
        assert.equal(result.bossAt5, "warlord");
        assert.equal(result.bossAt10, "harvester");
        assert.ok(result.wave9Size > result.wave1Size, "later waves are bigger");
        await page.close();
    });
});

suite("Browser · research", ({ test }) => {
    test("prerequisites gate the tree and researching raises production", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const research = EX.moduleFor("research");
            const state = EX.state();
            const baseline = research.productionMultiplier(1);

            // A deep node cannot be started before its prerequisites.
            state.research.points = 100000;
            research._startResearch("lastCityDoctrine");
            const blocked = !state.research.unlocked.lastCityDoctrine && !state.research.active;

            research._startResearch("salvageLogistics");
            research._pour();
            const afterFirst = research.productionMultiplier(1);

            const rateBefore = getSalvagePerSecond();
            research._startResearch("civicPlanning");
            const stillBlocked = !state.research.active || state.research.active.id !== "civicPlanning";
            return {
                baseline, blocked, afterFirst,
                unlocked: Object.keys(state.research.unlocked),
                stillBlocked, rateBefore
            };
        });
        assert.equal(result.baseline, 1, "no research means no bonus at all");
        assert.ok(result.blocked, "a node with unmet prerequisites must be refused");
        assert.ok(result.afterFirst > 1, "a researched node must raise production");
        assert.includes(result.unlocked, "salvageLogistics");
        assert.ok(result.stillBlocked, "a node needing an unresearched prerequisite stays blocked");
        await page.close();
    });

    test("research survives a City Renewal, but the city layout does not", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const city = EX.moduleFor("city");
            const research = EX.moduleFor("research");
            const state = EX.state();

            state.research.points = 5000;
            research._startResearch("salvageLogistics");
            research._pour();
            game.buildings.shelter = 2;
            city._place("shelter", 0, 0);
            city._syncRoster();

            const before = {
                plots: state.city.plots.length,
                survivors: state.survivors.roster.length,
                unlocked: Object.keys(state.research.unlocked).length
            };

            // Meet the renewal requirement and perform the game's own rebirth.
            game.buildings.citycenter = 4;
            game.adventure.progression.beaconModules = 3;
            game.salvage = 1e9;
            doRebirth();

            const after = EX.state();
            return {
                before,
                plotsAfter: after.city.plots.length,
                survivorsAfter: after.survivors.roster.length,
                unlockedAfter: Object.keys(after.research.unlocked).length,
                rebirths: game.rebirths
            };
        });
        assert.ok(result.before.plots > 0 && result.before.unlocked > 0, "the fixture should have built and researched");
        assert.equal(result.rebirths, 1, "the original rebirth must still work");
        assert.equal(result.plotsAfter, 0, "the city layout belongs to the run and is cleared");
        assert.equal(result.survivorsAfter, 0, "survivors are recruited again in the new run");
        assert.equal(result.unlockedAfter, result.before.unlocked, "research is permanent and must survive");
        await page.close();
    });
});

suite("Browser · people, missions and companions", ({ test }) => {
    test("a dialogue choice is recorded once and pays out once", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const events = EX.moduleFor("events");
            const state = EX.state();
            events.openPeople("people");
            const conversation = events._nextConversation("mara");
            const relBefore = events.relationship("mara");
            const researchBefore = state.research.points;

            // Choose, then try to choose again — the second must do nothing.
            document.querySelector('[data-people-action="talk"][data-people-value="mara"]')?.click();
            events._chooseOption("grid");
            const afterFirst = { rel: events.relationship("mara"), research: state.research.points };
            events._chooseOption("beacon");
            const afterSecond = { rel: events.relationship("mara"), research: state.research.points };

            document.getElementById("peopleModal")?.close?.();
            return {
                conversation, relBefore, afterFirst, afterSecond,
                recorded: state.narrative.choices[conversation],
                researchBefore
            };
        });
        assert.equal(result.conversation, "mara:first");
        assert.ok(result.afterFirst.rel > result.relBefore, "the choice should change the relationship");
        assert.ok(result.afterFirst.research > result.researchBefore, "the choice should pay out");
        assert.equal(result.afterSecond.rel, result.afterFirst.rel, "a choice can never be taken twice");
        assert.equal(result.afterSecond.research, result.afterFirst.research);
        assert.equal(result.recorded, "grid", "the decision is recorded permanently");
        await page.close();
    });

    test("a mission runs on a timer, resolves once, and pays on claim", async () => {
        const page = await openPage();
        await startGame(page);
        await enrich(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const events = EX.moduleFor("events");
            const city = EX.moduleFor("city");
            const state = EX.state();
            city._syncRoster();

            const started = events._startMission("firstSweep");
            const whileRunning = state.narrative.missions.firstSweep.state;
            // Too early: resolving must do nothing.
            events._resolveMission("firstSweep");
            const stillActive = state.narrative.missions.firstSweep.state;

            // Wind the clock back so the crew is due home.
            state.narrative.missions.firstSweep.completedAt = Date.now() - 1000;
            events._resolveMission("firstSweep");
            const resolved = state.narrative.missions.firstSweep.state;
            const outcome = state.narrative.missions.firstSweep.progress;

            const salvageBefore = game.salvage;
            const researchBefore = state.research.points;
            events._claimMission("firstSweep");
            const paid = (game.salvage - salvageBefore) + (state.research.points - researchBefore);
            const afterClaim = state.narrative.missions.firstSweep.state;
            return {
                started, whileRunning, stillActive, resolved, outcome, paid, afterClaim,
                chance: events.successChance("firstSweep")
            };
        });
        assert.ok(result.started, "a mission with enough survivors should start");
        assert.equal(result.whileRunning, "active");
        assert.equal(result.stillActive, "active", "a mission must not resolve before its timer");
        assert.equal(result.resolved, "done");
        assert.ok(result.outcome === 0 || result.outcome === 1, "the outcome is rolled exactly once and stored");
        assert.ok(result.paid > 0, "claiming pays something, even on a failed run");
        assert.equal(result.afterClaim, "available", "missions become repeatable after claiming");
        assert.inRange(result.chance, 0.15, 0.97);
        await page.close();
    });

    test("companions gain levels, learn abilities and can hold a role", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const pets = EX.moduleFor("pets");
            const state = EX.state();
            // Give the player a companion through the original collection.
            game.adventure.collection["1-2"] = 1;
            state.pets.levels["1-2"] = 1;

            const baseMultiplier = pets.productionMultiplier(1);
            pets._grantXp("1-2", 100000);
            const level = pets.level("1-2");
            const ability = pets.hasAbility("1-2", "forager");

            game.adventure.equipped[1] = ["1-2"];
            const equippedMultiplier = pets.productionMultiplier(1);

            pets._grantItem("emberCharm", 1);
            pets._equipItem("1-2", "emberCharm");
            const kitted = pets.productionMultiplier(1);

            pets._assign("combat", "1-2");
            const assigned = state.pets.assignments.combat;
            pets._assign("explore", "1-2");
            const movedRole = { combat: state.pets.assignments.combat, explore: state.pets.assignments.explore };
            return { baseMultiplier, level, ability, equippedMultiplier, kitted, assigned, movedRole };
        });
        assert.equal(result.baseMultiplier, 1, "an unequipped companion changes nothing");
        assert.ok(result.level > 1, "experience must produce levels");
        assert.ok(result.ability, "a levelled companion learns its first ability");
        assert.ok(result.equippedMultiplier > 1, "an equipped, levelled companion helps production");
        assert.ok(result.kitted > result.equippedMultiplier, "equipment adds on top");
        assert.equal(result.assigned, "1-2");
        assert.equal(result.movedRole.combat, undefined, "a companion holds one role at a time");
        assert.equal(result.movedRole.explore, "1-2");
        await page.close();
    });
});

// =============================================
// Economy rebalance, anti-autoclick and onboarding
//
// These assert exact or bounded values rather than "the number went up",
// which is what let the original explosion through: every broken build still
// passed a test that only checked Salvage increased.
// =============================================
suite("Browser · economy bounds", ({ test }) => {

    test("a fresh city starts at zero and the first gather pays exactly 1", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            game.cityTech.critChance = 0;            // crits are random; excluded by design
            resetGatherRateLimit();
            const start = { salvage: game.salvage, rate: getSalvagePerSecond(), combo: game.combo };
            document.getElementById("energyButton").click();
            return {
                start,
                afterOne: game.salvage,
                comboAfterOne: game.combo,
                clickPower: getClickPower(),
                multiplier: getSalvageMultiplier(),
                display: document.getElementById("salvage").textContent
            };
        });
        assert.equal(result.start.salvage, 0, "a new city holds no Salvage");
        assert.equal(result.start.rate, 0, "a new city produces nothing per second");
        assert.equal(result.start.combo, 0, "a new city has no momentum");
        assert.equal(result.clickPower, 1, "click power starts at exactly 1");
        assert.equal(result.multiplier, 1, "a new city has no multipliers at all");
        assert.equal(result.afterOne, 1, "the first gather must pay the +1 the interface promises");
        assert.equal(result.comboAfterOne, 1, "the first gather builds momentum for the NEXT one");
        await page.close();
    });

    test("ten legal gathers land in a tight, predictable band", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(async () => {
            game.cityTech.critChance = 0;
            resetGatherRateLimit();
            game.salvage = 0; game.totalSalvage = 0; game.combo = 0;
            const button = document.getElementById("energyButton");
            const displays = [];
            for (let i = 0; i < 10; i++) {
                button.click();
                displays.push(document.getElementById("salvage").textContent);
                await new Promise(resolve => setTimeout(resolve, 85));
            }
            return { salvage: game.salvage, clicks: game.totalClicks, combo: game.combo, displays };
        });
        assert.equal(result.clicks, 10, "ten legal gathers must all be accepted");
        assert.equal(result.combo, 10, "momentum rises one step per gather");
        // 1 + 1.02 + 1.04 ... + 1.18 = 10.9 exactly, with momentum at 2% a step.
        assert.close(result.salvage, 10.9, 0.001, "ten gathers must pay 10.9, not 10 and not 11");
        assert.notEqual(result.displays[0], result.displays[1], "the counter must move on every gather");
        await page.close();
    });

    test("100 instant synthetic presses are capped at the per-second limit", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            game.cityTech.critChance = 0;
            resetGatherRateLimit();
            game.salvage = 0; game.totalClicks = 0; game.combo = 0;
            const limit = gatherRateLimit();
            const button = document.getElementById("energyButton");
            for (let i = 0; i < 100; i++) button.click();
            return { limit, accepted: game.totalClicks, ignored: gatherBlocked, salvage: game.salvage };
        });
        assert.equal(result.limit, 12, "a pointer device is capped at 12 presses a second");
        assert.equal(result.accepted, result.limit, "no more than the cap may be paid out");
        assert.equal(result.ignored, 100 - result.limit, "every press over the cap is ignored, not queued");
        assert.ok(result.salvage < 15, "a 100-press burst cannot pay out 100 gathers");
        await page.close();
    });

    test("a held key cannot stand in for repeated presses", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            resetGatherRateLimit();
            game.totalClicks = 0;
            const button = document.getElementById("energyButton");
            button.focus();
            let refused = 0;
            for (let i = 0; i < 25; i++) {
                const event = new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true, cancelable: true });
                button.dispatchEvent(event);
                if (event.defaultPrevented) refused++;
            }
            const single = new KeyboardEvent("keydown", { key: " ", repeat: false, bubbles: true, cancelable: true });
            button.dispatchEvent(single);
            return { refused, singleAllowed: !single.defaultPrevented };
        });
        assert.equal(result.refused, 25, "every auto-repeat from a held key must be refused");
        assert.ok(result.singleAllowed, "a real single press must still go through");
        await page.close();
    });

    test("the rate limit never touches passive production", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(async () => {
            resetGatherRateLimit();
            game.buildings.scavenger = 20;
            const rate = getSalvagePerSecond();
            const button = document.getElementById("energyButton");
            for (let i = 0; i < 200; i++) button.click();   // saturate the limiter
            const before = game.salvage;
            await new Promise(resolve => setTimeout(resolve, 2200));
            return { rate, gained: game.salvage - before };
        });
        assert.close(result.rate, 10, 0.001, "20 camps produce exactly 10 Salvage a second");
        // Two seconds of a 10/sec city, with slack for a loaded CI machine.
        assert.ok(result.gained > result.rate, "buildings must keep paying while input is being refused");
        assert.ok(result.gained < result.rate * 4, "and must not pay more than the elapsed time allows");
        await page.close();
    });

    test("early Ashfall stays in readable numbers, with no scientific notation", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const read = () => ({
                rate: getSalvagePerSecond(),
                shown: document.getElementById("salvageRate").textContent
            });
            game.buildings.scavenger = 1; updateGame();
            const oneCamp = read();
            game.buildings.scavenger = 5; game.buildings.shelter = 2; updateGame();
            const early = read();
            game.buildings.scavenger = 25; game.buildings.shelter = 10;
            game.buildings.workshop = 3; game.cityTech.salvageAccelerator = 6; updateGame();
            const mid = read();
            return { oneCamp, early, mid };
        });
        assert.close(result.oneCamp.rate, 0.5, 0.001, "one camp is exactly half a Salvage a second");
        assert.ok(result.early.rate > 1 && result.early.rate < 10, "five camps belong in single digits");
        assert.ok(result.mid.rate > 10 && result.mid.rate < 2000, "mid Ashfall belongs in tens to hundreds");
        for (const sample of [result.oneCamp, result.early, result.mid]) {
            assert.notOk(/e\+?\d/i.test(sample.shown), "early play must never show scientific notation: " + sample.shown);
        }
        await page.close();
    });

    test("renewals raise production linearly, never exponentially", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const at = count => { game.rebirths = count; return stageResetMultiplier(1); };
            return { r0: at(0), r1: at(1), r2: at(2), r10: at(10), r40: at(40), r100: at(100) };
        });
        assert.equal(result.r0, 1, "no renewals means no bonus");
        assert.close(result.r1, 1.5, 1e-9, "one renewal is +50%");
        assert.close(result.r10, 6, 1e-9, "ten renewals is +500%, not 1,024x");
        assert.close(result.r40, 21, 1e-9, "forty renewals is 21x, not a million million");
        // The defining property: every renewal is worth the same as the first.
        assert.close(result.r2 - result.r1, result.r1 - result.r0, 1e-9, "each renewal adds the same amount");
        assert.close(result.r100 - result.r40, 0.5 * 60, 1e-9, "the step never grows with the count");
        await page.close();
    });

    test("a deep, fully upgraded account stays inside the display ceiling", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            game.rebirths = 40;
            game.cityTech.salvageAccelerator = 40;
            game.cityTech.sturdyGloves = 40;
            game.cityTech.campEfficiency = 20;
            game.buildings = { scavenger: 200, shelter: 100, workshop: 50, power: 50, citycenter: 10 };
            for (const stage of [2, 3, 4, 5]) game["stage" + stage + "Unlocked"] = true;
            return { multiplier: getSalvageMultiplier(), rate: getSalvagePerSecond() };
        });
        assert.ok(Number.isFinite(result.rate), "the rate must stay a finite number");
        assert.ok(result.multiplier < 1e9, "a maxed account's multiplier must stay under 1e9, was " + result.multiplier);
        assert.ok(result.rate < 1e13, "a maxed account's rate must stay under 1e13, was " + result.rate);
        await page.close();
    });
});

suite("Browser · save versioning and guest mode", ({ test }) => {

    const BROKEN_SAVE = JSON.stringify({
        salvage: 1.73e36, totalSalvage: 4e36, lifetimeSalvage: 9.1e36, rebirths: 31, introSeen: true,
        buildings: { scavenger: 120, shelter: 60, workshop: 30, power: 40, citycenter: 9, farm: 20, factory: 14 },
        cityTech: { sturdyGloves: 40, salvageAccelerator: 40, salvageMagnet: 5, campEfficiency: 20, housingBlocks: 5 },
        rebirthUpgrades: { efficient: 20, legacy: 1, fastHands: 400, autoClicker: 90 },
        stage2Unlocked: true, stage5Unlocked: true,
        stage2Upgrades: { deepSalvage: 20 },
        stage5Upgrades: { totalSalvage: 20, ascension: 1 },
        stage5ResetUpgrades: { lastCity: 1, salvageBoost5: 20, ascensionLegacy: 1, autoAscension: 1 },
        economy: { version: 3, legacyOutput: 5200, legacyPopulation: 40, legacyProduction: 3.55,
                   legacyUpgradeMultipliers: { salvageAccelerator: 39 }, legacyFlatLevels: {} }
    });

    test("a pre-rebalance save is repaired, not loaded as it stands", async () => {
        const page = await openPage({ seedSave: BROKEN_SAVE });
        const loaded = await page.evaluate(() => ({
            salvage: game.salvage,
            rate: getSalvagePerSecond(),
            saveVersion: game.saveVersion,
            // progress must survive untouched
            rebirths: game.rebirths,
            stage5: game.stage5Unlocked,
            camps: game.buildings.scavenger,
            workshops: game.buildings.workshop,
            // upgrades with no purchase path in this build must be cleared
            retiredLegacy: game.rebirthUpgrades.legacy,
            retiredDeepSalvage: game.stage2Upgrades.deepSalvage,
            retiredTotalSalvage: game.stage5Upgrades.totalSalvage,
            // conveniences are not multipliers, and are kept
            automation: game.stage5ResetUpgrades.autoAscension
        }));
        assert.equal(loaded.saveVersion, 4, "the save is stamped with the current version");
        assert.ok(loaded.salvage <= 1e9, "a 1.73e36 balance must not survive the load");
        assert.ok(loaded.rate < 1e14, "the repaired rate must come down by orders of magnitude");
        assert.equal(loaded.rebirths, 31, "renewals are progress and must be kept");
        assert.equal(loaded.stage5, true, "unlocked zones must be kept");
        assert.equal(loaded.camps, 30, "a building line above its maximum is clamped to it");
        assert.equal(loaded.workshops, 30, "a building line within its limits is left exactly as it was");
        assert.equal(loaded.retiredLegacy, 0, "an upgrade this build cannot sell must be cleared");
        assert.equal(loaded.retiredDeepSalvage, 0, "retired supply-link upgrades must be cleared");
        assert.equal(loaded.retiredTotalSalvage, 0, "retired zone-5 multipliers must be cleared");
        assert.equal(loaded.automation, 1, "automation is a convenience and is kept");
        await page.close();
    });

    test("the player is told what changed and can start fresh instead", async () => {
        const page = await openPage({ seedSave: BROKEN_SAVE });
        await startGame(page);
        await page.waitForTimeout(3200);        // the notice waits for the city to be on screen
        const notice = await page.evaluate(() => {
            const dialog = document.getElementById("saveRecoveryModal");
            return {
                shown: !!dialog?.open,
                changes: [...(dialog?.querySelectorAll(".recovery-list li") || [])].length,
                hasKeep: !!document.getElementById("saveRecoveryKeep"),
                hasReset: !!document.getElementById("saveRecoveryReset")
            };
        });
        assert.ok(notice.shown, "a repaired save must explain itself rather than loading silently");
        assert.ok(notice.changes >= 1, "the notice must list what was changed");
        assert.ok(notice.hasKeep && notice.hasReset, "the player must be offered both choices");

        const fresh = await page.evaluate(() => {
            document.getElementById("saveRecoveryReset").click();
            return { salvage: game.salvage, rebirths: game.rebirths, camps: game.buildings.scavenger,
                     stage5: game.stage5Unlocked, clickPower: getClickPower() };
        });
        assert.equal(fresh.salvage, 0, "starting fresh must really start at zero");
        assert.equal(fresh.rebirths, 0, "starting fresh clears renewals");
        assert.equal(fresh.camps, 0, "starting fresh clears buildings");
        assert.equal(fresh.stage5, false, "starting fresh re-locks the zones");
        assert.equal(fresh.clickPower, 1, "starting fresh resets click power to 1");
        await page.close();
    });

    test("a save written by this build loads without a word", async () => {
        const current = JSON.stringify({
            saveVersion: 4, salvage: 4200, totalSalvage: 9000, rebirths: 2, introSeen: true,
            buildings: { scavenger: 12, shelter: 4 }, cityTech: { salvageAccelerator: 3 }
        });
        const page = await openPage({ seedSave: current });
        await startGame(page);
        await page.waitForTimeout(2600);
        const result = await page.evaluate(() => ({
            notice: !!document.getElementById("saveRecoveryModal"),
            salvage: game.salvage, rebirths: game.rebirths, camps: game.buildings.scavenger
        }));
        assert.notOk(result.notice, "a current save must not be accused of being broken");
        assert.ok(result.salvage >= 4200, "a current save keeps its balance");
        assert.equal(result.rebirths, 2, "a current save keeps its renewals");
        assert.equal(result.camps, 12, "a current save keeps its buildings");
        await page.close();
    });

    test("NEW GUEST starts empty and never touches a registered player's city", async () => {
        const guest = JSON.stringify({ saveVersion: 4, salvage: 812, totalSalvage: 3100, introSeen: true,
            buildings: { scavenger: 9, shelter: 2 }, totalClicks: 140 });
        const account = JSON.stringify({ saveVersion: 4, salvage: 99999, totalSalvage: 500000,
            introSeen: true, buildings: { scavenger: 44, workshop: 3 } });

        const page = await openPage({ seedSave: guest });
        await page.evaluate(value => localStorage.setItem("lastCitySaveV2:account:ava", value), account);
        const offered = await page.evaluate(() => ({
            play: document.getElementById("startPlayLabel")?.textContent?.trim(),
            newGuestShown: !document.getElementById("startNewGuestButton")?.hidden
        }));
        assert.equal(offered.play, "CONTINUE GUEST CITY", "a guest with a city here is offered CONTINUE");
        assert.ok(offered.newGuestShown, "and is also offered a new guest game");

        const result = await page.evaluate(async () => {
            document.getElementById("startNewGuestButton").click();   // confirm step
            await new Promise(resolve => setTimeout(resolve, 60));
            document.getElementById("startNewGuestButton").click();   // and through
            await new Promise(resolve => setTimeout(resolve, 400));
            return {
                salvage: game.salvage, total: game.totalSalvage,
                camps: game.buildings.scavenger, clicks: game.totalClicks,
                archived: !!localStorage.getItem("lastCitySaveV2:guest-previous"),
                accountSalvage: JSON.parse(localStorage.getItem("lastCitySaveV2:account:ava") || "{}").salvage
            };
        });
        assert.equal(result.salvage, 0, "a new guest game starts with nothing");
        assert.equal(result.total, 0, "a new guest game starts with no history");
        assert.equal(result.camps, 0, "a new guest game inherits no buildings");
        assert.equal(result.clicks, 0, "a new guest game inherits no click count");
        assert.ok(result.archived, "the previous guest's city is set aside, not destroyed");
        assert.equal(result.accountSalvage, 99999, "a registered player's save must be left alone");
        await page.close();
    });

    test("CONTINUE GUEST loads the city that is already on this browser", async () => {
        const guest = JSON.stringify({ saveVersion: 4, salvage: 812, totalSalvage: 3100, introSeen: true,
            buildings: { scavenger: 9, shelter: 2 }, totalClicks: 140 });
        const page = await openPage({ seedSave: guest });
        await startGame(page);
        const result = await page.evaluate(() => ({
            salvage: game.salvage, camps: game.buildings.scavenger, clicks: game.totalClicks
        }));
        assert.ok(result.salvage >= 812, "continuing keeps the guest balance");
        assert.equal(result.camps, 9, "continuing keeps the guest buildings");
        assert.equal(result.clicks, 140, "continuing keeps the guest history");
        await page.close();
    });

    test("offline production counts toward total Salvage, so contracts complete", async () => {
        const away = JSON.stringify({
            saveVersion: 4, salvage: 0, totalSalvage: 0, lifetimeSalvage: 0, introSeen: true,
            buildings: { scavenger: 40 }, lastSeen: Date.now() - 3600 * 1000
        });
        const page = await openPage({ seedSave: away });
        const result = await page.evaluate(() => ({
            salvage: game.salvage,
            total: game.totalSalvage,
            lifetime: game.lifetimeSalvage,
            contractMet: CONTRACTS.growingCity.check()
        }));
        assert.ok(result.salvage > 0, "an hour away must pay something");
        assert.equal(result.total, result.salvage, "offline Salvage must count toward this run's total");
        assert.ok(result.lifetime >= result.salvage, "and toward lifetime Salvage");
        assert.ok(result.contractMet, "the 2,500 total Salvage contract must see offline earnings");
        await page.close();
    });
});

suite("Browser · onboarding", ({ test }) => {

    test("a new player sees only Play and City, and Upgrades opens when needed", async () => {
        const page = await openPage();
        await startGame(page);
        const read = () => page.evaluate(() => Object.fromEntries(
            [...document.querySelectorAll(".game-mode-tab")].map(tab => [tab.dataset.mode, !tab.classList.contains("locked")])));

        const atStart = await read();
        assert.equal(atStart.city, true, "Play is always available");
        assert.equal(atStart.build, true, "City is always available");
        assert.equal(atStart.glyphs, false, "Glyphs must not greet a new player");
        assert.equal(atStart.companions, false, "Companions must not greet a new player");
        assert.equal(atStart.stories, false, "Stories must not greet a new player");
        assert.equal(atStart.upgrades, false, "Upgrades waits until there is something to spend");

        await page.evaluate(() => { game.totalSalvage = 12; renderPlayerUI(); });
        const afterGathering = await read();
        assert.equal(afterGathering.upgrades, true, "Upgrades must open as soon as the first camp is affordable");
        assert.equal(afterGathering.glyphs, false, "and nothing else opens with it");

        await page.evaluate(() => { game.rebirths = 1; renderPlayerUI(); });
        const afterRenewal = await read();
        assert.equal(afterRenewal.glyphs, true, "Glyphs open at the first renewal");
        assert.equal(afterRenewal.companions, true, "Companions open at the first renewal");
        await page.close();
    });

    test("an unlocked section never locks again", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            game.rebirths = 1; renderPlayerUI();
            const opened = !document.querySelector('.game-mode-tab[data-mode="glyphs"]').classList.contains("locked");
            game.rebirths = 0;                       // as a renewal would leave it
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            renderPlayerUI();
            return { opened,
                stillOpen: !document.querySelector('.game-mode-tab[data-mode="glyphs"]').classList.contains("locked"),
                recorded: game.onboarding.revealed.glyphs === true };
        });
        assert.ok(result.opened, "the first renewal opens Glyphs");
        assert.ok(result.stillOpen, "a renewal that clears the city must not take Glyphs away again");
        assert.ok(result.recorded, "the reveal is recorded in the save");
        await page.close();
    });

    test("the tutorial starts at step one, highlights its target, and is skippable", async () => {
        const page = await openPage();
        await startGame(page);
        await page.waitForTimeout(600);
        const first = await page.evaluate(() => {
            const coach = document.getElementById("tutorialCoach");
            return {
                visible: !!coach && !coach.hidden,
                step: coach?.querySelector(".eyebrow")?.textContent,
                title: coach?.querySelector("strong")?.textContent,
                highlighted: document.querySelector(".onboarding-highlight")?.id
            };
        });
        assert.ok(first.visible, "a new player is given the first step");
        assert.includes(first.step, "STEP 1");
        assert.equal(first.title, "Gather Salvage", "step one is gathering, not Glyphs or Rebirth");
        assert.equal(first.highlighted, "energyButton", "step one must highlight the gather button");

        const skipped = await page.evaluate(async () => {
            document.getElementById("tutorialDismiss").click();
            await new Promise(resolve => setTimeout(resolve, 400));
            return {
                hidden: document.getElementById("tutorialCoach").hidden,
                highlight: !!document.querySelector(".onboarding-highlight")
            };
        });
        assert.ok(skipped.hidden, "skipping must put the tutorial away");
        assert.notOk(skipped.highlight, "and clear the highlight with it");
        await page.close();
    });

    test("no advanced system is taught in the first minute", async () => {
        const page = await openPage();
        await startGame(page);
        const early = await page.evaluate(() => {
            const EX = window.LastCityExpansion;
            const state = EX.state();
            state.tutorial.completedSteps = {};
            state.tutorial.done = false;
            state.tutorial.dismissed = false;
            EX.render?.();
            return (document.getElementById("tutorialCoach")?.textContent || "").toLowerCase();
        });
        for (const forbidden of ["glyph", "companion", "pet", "rebirth", "renewal", "prestige"]) {
            assert.notOk(early.includes(forbidden), "the first step must not mention " + forbidden);
        }
        await page.close();
    });

    test("the field guide opens, locks what is unreached, and replays the tutorial", async () => {
        const page = await openPage();
        await startGame(page);
        const guide = await page.evaluate(async () => {
            document.getElementById("guideButton").click();
            await new Promise(resolve => setTimeout(resolve, 250));
            return {
                open: document.getElementById("guideModal").open,
                sections: [...document.querySelectorAll(".guide-section h3")].map(h => h.textContent.trim()),
                locked: [...document.querySelectorAll(".guide-locked h3")].map(h => h.textContent.replace("???", "").trim())
            };
        });
        assert.ok(guide.open, "the ? button must open the guide");
        assert.ok(guide.sections.length >= 10, "the guide covers every system");
        assert.includes(guide.locked.join(" "), "Glyphs", "an unreached system shows as locked");
        assert.includes(guide.locked.join(" "), "Companions", "an unreached system shows as locked");

        const replayed = await page.evaluate(async () => {
            window.LastCityExpansion.state().tutorial.dismissed = true;
            document.getElementById("guideReplay").click();
            await new Promise(resolve => setTimeout(resolve, 500));
            const coach = document.getElementById("tutorialCoach");
            return { guideClosed: !document.getElementById("guideModal").open,
                     step: coach?.querySelector(".eyebrow")?.textContent };
        });
        assert.ok(replayed.guideClosed, "replaying closes the guide and returns to the game");
        assert.includes(replayed.step, "STEP 1", "replay restarts at step one");
        await page.close();
    });

    test("a locked zone shows its name, that it is locked, and what opens it", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            const tab = document.querySelector('.stage-tab[data-stage="2"]');
            const before = currentStageView;
            tab.click();
            return {
                locked: tab.classList.contains("locked"),
                label: tab.textContent.trim(),
                title: tab.title,
                aria: tab.getAttribute("aria-label"),
                stayedPut: currentStageView === before
            };
        });
        assert.ok(result.locked, "zone 2 is locked for a new player");
        assert.includes(result.label, "Depot", "the zone still shows its name");
        assert.includes(result.title, "Locked", "and says that it is locked");
        assert.includes(result.title, "City Centers", "and states the requirement to open it");
        assert.includes(result.aria, "locked", "screen readers are told the same thing");
        assert.ok(result.stayedPut, "a locked zone cannot be entered");
        await page.close();
    });

    test("daily rewards do not dwarf the first building", async () => {
        const page = await openPage();
        await startGame(page);
        const reward = await page.evaluate(() => {
            // A brand-new city: nothing built, nothing unlocked.
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            for (const stage of [2, 3, 4, 5]) game["stage" + stage + "Unlocked"] = false;
            const fresh = dailyRewardState(Date.now()).amount;
            // And an established one, which should still be paid properly.
            game.buildings.scavenger = 200;
            for (const stage of [2, 3]) game["stage" + stage + "Unlocked"] = true;
            return { fresh, established: dailyRewardState(Date.now()).amount,
                     campCost: BUILDINGS.scavenger.baseCost };
        });
        assert.ok(reward.fresh <= reward.campCost * 3,
            "a brand-new player's daily reward must not be worth 16 buildings, was " + reward.fresh);
        assert.ok(reward.fresh > 0, "but it must still be worth claiming");
        assert.ok(reward.established > reward.fresh,
            "an established city is still paid more than a brand-new one");
        await page.close();
    });
});

// =============================================
// Economy pacing
//
// Balance is judged by TIME TO AFFORD, not by how large a number looks.
// These tests pin the pacing targets: early purchases in seconds, mid-game
// in tens of seconds, majors in minutes, and no point where production so
// exceeds prices that buying becomes instant.
// =============================================
suite("Browser · economy pacing", ({ test }) => {

    // Seconds to afford something, given what the city produces right now.
    const TIME_TO_AFFORD = () => {
        window.__ttf = (cost, clicksPerSecond = 0) => {
            const income = getSalvagePerSecond() + clicksPerSecond * getClickPower() * getSalvageMultiplier();
            return income > 0 ? cost / income : Infinity;
        };
        window.__freshCity = () => {
            game.salvage = 0; game.totalSalvage = 0; game.rebirths = 0; game.cityTech.critChance = 0;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 0, salvageAccelerator: 0, salvageMagnet: 0,
                dropScanner: 0, campEfficiency: 0, workforceTraining: 0, housingBlocks: 0,
                communityHub: 0, critChance: 0, momentumCoil: 0, pulseTool: 0, clickAmplifier: 0 };
            game.rebirthUpgrades = { efficient: 0, headStart: 0, cheapBuild: 0 };
            for (const st of [2, 3, 4, 5]) { game['stage' + st + 'Unlocked'] = false; game['stage' + st + 'Resets'] = 0; }
            game.stage2Upgrades = { ...game.stage2Upgrades, salvageBoost: 0 };
            game.stage2ResetUpgrades = { ...game.stage2ResetUpgrades, salvageBoost2: 0, settlementLegacy: 0 };
            game.stage5ResetUpgrades = { ...game.stage5ResetUpgrades, lastCity: 0 };
            game.adventure.progression.beaconModules = 0;
            game.adventure.collection = {}; game.adventure.equipped = { 1: [], 2: [], 3: [], 4: [], 5: [] };
            game.economy.legacyOutput = 0; game.economy.legacyProduction = 1; game.economy.legacyPopulation = 0;
        };
    };

    test("the first Scavenger Camp is reachable in seconds of hand gathering", async () => {
        const page = await openPage();
        await startGame(page);
        await page.evaluate(TIME_TO_AFFORD);
        const result = await page.evaluate(() => {
            window.__freshCity();
            return { cost: getBuildingCost('scavenger'), seconds: window.__ttf(getBuildingCost('scavenger'), 5) };
        });
        assert.equal(result.cost, 15, "the first camp costs 15");
        assert.ok(result.seconds >= 2 && result.seconds <= 30,
            "a new player should reach it in 2-30s of gathering, was " + result.seconds.toFixed(1) + "s");
        await page.close();
    });

    test("early Ashfall purchases land in the 5-30 second band", async () => {
        const page = await openPage();
        await startGame(page);
        await page.evaluate(TIME_TO_AFFORD);
        const result = await page.evaluate(() => {
            window.__freshCity();
            game.buildings.scavenger = 6; game.cityTech.sturdyGloves = 3;
            return {
                camp: window.__ttf(getBuildingCost('scavenger'), 5),
                shelter: window.__ttf(getBuildingCost('shelter'), 5),
                tool: window.__ttf(economyUpgradeCost(TECH_UPGRADES.sturdyGloves, game.cityTech.sturdyGloves), 5)
            };
        });
        for (const [name, seconds] of Object.entries(result)) {
            assert.ok(seconds > 0.5 && seconds < 60,
                "early " + name + " should take 0.5-60s, was " + seconds.toFixed(1) + "s");
        }
        await page.close();
    });

    test("a major purchase takes minutes, not seconds", async () => {
        const page = await openPage();
        await startGame(page);
        await page.evaluate(TIME_TO_AFFORD);
        const result = await page.evaluate(() => {
            window.__freshCity();
            // A city around the five-minute mark.
            game.buildings = { scavenger: 18, shelter: 8, workshop: 4, power: 0, citycenter: 0 };
            game.cityTech.sturdyGloves = 14; game.cityTech.salvageMagnet = 2;
            return {
                rate: getSalvagePerSecond(),
                powerPlant: window.__ttf(getBuildingCost('power'), 3),
                workshop: window.__ttf(getBuildingCost('workshop'), 3)
            };
        });
        assert.ok(result.rate > 10 && result.rate < 500,
            "a five-minute city should make tens of Salvage a second, was " + result.rate.toFixed(1));
        assert.ok(result.powerPlant > 30 && result.powerPlant < 600,
            "the first Power Plant should be a 0.5-10 minute goal, was " + Math.round(result.powerPlant) + "s");
        assert.ok(result.workshop > 2, "a Workshop should never be instant, was " + result.workshop.toFixed(1) + "s");
        await page.close();
    });

    test("completing Ashfall is a real objective, not one click after unlocking", async () => {
        const page = await openPage();
        await startGame(page);
        await page.evaluate(TIME_TO_AFFORD);
        const result = await page.evaluate(() => {
            window.__freshCity();
            game.buildings = { scavenger: 30, shelter: 16, workshop: 12, power: 5, citycenter: 0 };
            game.cityTech.salvageAccelerator = 6; game.cityTech.sturdyGloves = 18;
            let total = 0;
            for (let i = 0; i < 4; i++) { total += getBuildingCost('citycenter'); game.buildings.citycenter++; }
            return { rate: getSalvagePerSecond(), total, seconds: window.__ttf(total, 0) };
        });
        assert.ok(result.seconds > 120,
            "four City Centers must take real progression, was " + Math.round(result.seconds) + "s");
        assert.ok(result.seconds < 5400,
            "but must not be an hour-long wall, was " + Math.round(result.seconds) + "s");
        await page.close();
    });

    test("production stays inside a defined ceiling at every stage of Ashfall", async () => {
        const page = await openPage();
        await startGame(page);
        await page.evaluate(TIME_TO_AFFORD);
        const result = await page.evaluate(() => {
            window.__freshCity();
            const read = () => ({ rate: getSalvagePerSecond(), shown: formatNumber(getSalvagePerSecond()) });
            const out = {};
            out.fresh = read();
            game.buildings.scavenger = 1; out.firstBuilding = read();
            game.buildings = { scavenger: 8, shelter: 3, workshop: 0, power: 0, citycenter: 0 }; out.early = read();
            game.buildings = { scavenger: 18, shelter: 8, workshop: 4, power: 1, citycenter: 0 };
            game.cityTech.sturdyGloves = 14; game.cityTech.salvageMagnet = 2; out.mid = read();
            game.buildings = { scavenger: 30, shelter: 16, workshop: 12, power: 5, citycenter: 1 };
            game.cityTech.salvageAccelerator = 6; out.late = read();
            return out;
        });
        assert.equal(result.fresh.rate, 0, "a fresh city produces nothing");
        assert.close(result.firstBuilding.rate, 0.5, 0.001, "one camp is exactly half a Salvage a second");
        assert.ok(result.early.rate > 1 && result.early.rate < 20, "early Ashfall belongs in single figures, was " + result.early.rate.toFixed(1));
        assert.ok(result.mid.rate > 20 && result.mid.rate < 500, "mid Ashfall belongs in tens, was " + result.mid.rate.toFixed(1));
        assert.ok(result.late.rate > 200 && result.late.rate < 20000, "late Ashfall belongs in hundreds to thousands, was " + result.late.rate.toFixed(1));
        for (const [name, sample] of Object.entries(result)) {
            assert.notOk(/e\+?\d/i.test(sample.shown), name + " must not show scientific notation: " + sample.shown);
        }
        await page.close();
    });

    test("renewals are a noticeable boost and never an explosion", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            window.__freshCity?.();
            game.buildings = { scavenger: 20, shelter: 10, workshop: 8, power: 3, citycenter: 0 };
            const at = n => { game.rebirths = n; return getSalvagePerSecond(); };
            return { r0: at(0), r1: at(1), r2: at(2), r10: at(10), r40: at(40) };
        });
        const gain = result.r1 / result.r0;
        assert.close(gain, 1.5, 0.01, "the first renewal is a clear +50%, not a rounding error and not a doubling");
        assert.close(result.r10 / result.r0, 6, 0.01, "ten renewals is 6x, not 1,024x");
        assert.close(result.r40 / result.r0, 21, 0.01, "forty renewals is 21x, not a trillion-fold");
        // The defining property of a linear curve.
        assert.close(result.r2 - result.r1, result.r1 - result.r0, 1e-6, "every renewal adds the same amount");
        await page.close();
    });

    test("opening a zone pays the earlier zones exactly what it advertises", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            window.__freshCity?.();
            game.buildings = { scavenger: 20, shelter: 10, workshop: 8, power: 3, citycenter: 0 };
            const read = () => ({ rate: getSalvagePerSecond(), synergy: synergyGroup(1) });
            const out = { none: read() };
            game.stage2Unlocked = true; out.depot = read();
            game.stage3Unlocked = true; out.foundry = read();
            game.stage4Unlocked = true; out.relay = read();
            game.stage5Unlocked = true; out.citadel = read();
            out.discount = stageSynergyBuildDiscount();
            out.autoGather = autoGatherEfficiency();
            return out;
        });
        assert.close(result.depot.synergy - result.none.synergy, 0.10, 1e-9, "Depot gives Ashfall +10%");
        assert.close(result.foundry.synergy - result.depot.synergy, 0.12, 1e-9, "Foundry adds +12%");
        assert.close(result.relay.synergy - result.foundry.synergy, 0.15, 1e-9, "Relay adds +15%");
        assert.close(result.citadel.synergy - result.relay.synergy, 0.20, 1e-9, "Citadel adds +20% to every zone");
        assert.close(result.citadel.rate / result.none.rate, 1.57, 0.01, "all five zones open is +57% to Ashfall, not an order of magnitude");
        assert.close(result.discount, 0.05, 1e-9, "Foundry gives a 5% building discount");
        assert.close(result.autoGather, 0.45, 1e-9, "Relay raises Auto Harvester output by half");
        await page.close();
    });

    test("every bonus lives inside one of the five pipeline groups", async () => {
        const page = await openPage();
        await startGame(page);
        const result = await page.evaluate(() => {
            window.__freshCity?.();
            game.buildings = { scavenger: 20, shelter: 10, workshop: 8, power: 3, citycenter: 1 };
            game.cityTech.salvageAccelerator = 12; game.rebirths = 5;
            game.stage2Unlocked = true;
            const base = getSalvageBase();
            const groups = upgradeMultiplier('salvageAccelerator') * renewalGroup(1) *
                synergyGroup(1) * companionGroup(1) * eventGroup(1);
            return { base, groups, product: base * groups, actual: getSalvagePerSecond() };
        });
        // If anything multiplies production outside the five groups, these diverge.
        assert.close(result.product, result.actual, Math.max(1e-6, result.actual * 1e-9),
            "BASE x the five groups must equal the published rate exactly");
        await page.close();
    });

    test("a normalized old save lands inside current balance expectations", async () => {
        const broken = JSON.stringify({
            salvage: 1.73e36, totalSalvage: 4e36, lifetimeSalvage: 9.1e36, rebirths: 31, introSeen: true,
            buildings: { scavenger: 120, shelter: 60, workshop: 30, power: 40, citycenter: 9, farm: 20, factory: 14 },
            cityTech: { sturdyGloves: 40, salvageAccelerator: 40, salvageMagnet: 5, campEfficiency: 20, housingBlocks: 5 },
            rebirthUpgrades: { efficient: 20, legacy: 1, fastHands: 400, autoClicker: 90 },
            stage2Unlocked: true, stage3Unlocked: true, stage4Unlocked: true, stage5Unlocked: true,
            stage2Upgrades: { salvageBoost: 20, deepSalvage: 20 },
            stage2ResetUpgrades: { salvageBoost2: 20 },
            stage5Upgrades: { totalSalvage: 20, ascension: 1 },
            stage5ResetUpgrades: { lastCity: 1, salvageBoost5: 20, ascensionLegacy: 1 },
            economy: { version: 3, legacyOutput: 5200, legacyPopulation: 40, legacyProduction: 3.55,
                       legacyUpgradeMultipliers: { salvageAccelerator: 39, sturdyGloves: 48 }, legacyFlatLevels: {} }
        });
        const page = await openPage({ seedSave: broken });
        const loaded = await page.evaluate(() => ({
            rate: getSalvagePerSecond(), shown: formatNumber(getSalvagePerSecond()),
            legacyProduction: game.economy.legacyProduction,
            legacyUpgrade: game.economy.legacyUpgradeMultipliers.salvageAccelerator,
            camps: game.buildings.scavenger, rebirths: game.rebirths, stage5: game.stage5Unlocked
        }));
        // The ceiling a completed account reaches under the current curves.
        assert.ok(loaded.rate < 3e10,
            "a normalized old save must sit under a completed account's ceiling, was " + loaded.rate.toExponential(2));
        assert.equal(loaded.legacyProduction, 1, "old conversion factors are dropped, not carried");
        assert.equal(loaded.legacyUpgrade, 1, "old upgrade compensation is dropped, not carried");
        assert.equal(loaded.camps, 30, "building lines come down to this build's maximum");
        assert.equal(loaded.rebirths, 31, "renewals are progression and are kept");
        assert.equal(loaded.stage5, true, "unlocked zones are kept");
        assert.notOk(/e\+?\d/i.test(loaded.shown), "and the result is readable: " + loaded.shown);
        await page.close();
    });

    test("no opening reward lets a new player skip the opening", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(async () => {
            game.salvage = 0; game.totalSalvage = 0; game.totalClicks = 0; game.cityTech.critChance = 0;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 0, salvageAccelerator: 0, salvageMagnet: 0 };
            for (const stage of [2, 3, 4, 5]) game['stage' + stage + 'Unlocked'] = false;
            const button = document.getElementById('energyButton');
            for (let i = 0; i < 25; i++) { button.click(); await new Promise(r => setTimeout(r, 85)); }
            const earnedByHand = game.salvage;
            // What each early payout is worth, in Scavenger Camps bought outright.
            const campsFor = amount => {
                const owned = game.buildings.scavenger;
                let spent = 0, camps = 0;
                while (spent + getBuildingCost('scavenger') <= amount) { spent += getBuildingCost('scavenger'); game.buildings.scavenger++; camps++; }
                game.buildings.scavenger = owned;
                return camps;
            };
            game.salvage = 0;
            CONTRACTS.firstShift.claim();
            const firstShift = game.salvage;
            game.salvage = 0;
            const daily = dailyRewardState(Date.now()).amount;
            const supply = getSupplyDropValue();
            return { earnedByHand, firstShift, daily, supply,
                     campsFromContract: campsFor(firstShift), campsFromDaily: campsFor(daily),
                     campsFromSupply: campsFor(supply), firstCamp: getBuildingCost('scavenger') };
        });
        assert.equal(r.firstCamp, 15, "the first camp costs 15");
        // The lesson the tutorial teaches is gather -> build -> automate. A
        // reward that buys seven camps outright replaces it.
        assert.ok(r.campsFromContract <= 3,
            "the First Shift contract buys " + r.campsFromContract + " camps outright — it must not skip the opening");
        assert.ok(r.firstShift <= r.earnedByHand * 2,
            "First Shift pays " + r.firstShift + " against " + r.earnedByHand.toFixed(0) + " earned by hand");
        assert.ok(r.firstShift >= r.firstCamp, "but must still be worth claiming");
        assert.ok(r.campsFromDaily <= 3, "the daily reward buys " + r.campsFromDaily + " camps outright");
        assert.ok(r.campsFromSupply <= 3, "a supply drop buys " + r.campsFromSupply + " camps outright");
        await page.close();
    });

    test("large numbers read as K, M, B and T rather than exponents", async () => {
        const page = await openPage();
        await startGame(page);
        const shown = await page.evaluate(() => [950, 1200, 24500, 999999, 1.3e6, 7.2e8, 4.2e9, 3.5e12, 9e17, 5e21]
            .map(formatNumber));
        assert.deepEqual(shown.slice(0, 9),
            ["950", "1.2K", "24.5K", "1.0M", "1.3M", "720M", "4.2B", "3.5T", "900Qa"],
            "readable units all the way to a quintillion");
        assert.includes(shown[9], "e21", "and scientific notation only past that");
        await page.close();
    });
});

// =============================================
// Five-zone pacing
//
// Every zone is walked purchase by purchase against the real game code, the
// way a player would: always buy whatever pays for itself soonest, and time
// each wait against what the zone actually earns. Snapshot tests cannot catch
// a zone that collapses into one-second purchases halfway through; these can.
// =============================================
suite("Browser · five-zone pacing", ({ test }) => {

    const ZONE_SIM = () => {
        window.__zone = {
            1: { name: 'Ashfall', rate: () => getSalvagePerSecond(),
                 active: () => ({ reward: getClickPower() * getSalvageMultiplier(), period: 200 }),
                 table: () => [TECH_UPGRADES, game.cityTech], buildings: true },
            2: { name: 'Depot', rate: () => getScrapPerSecond(),
                 active: () => ({ reward: (searchReward(0) + searchReward(1) + searchReward(2)) / 3, period: searchDuration() }),
                 table: () => [STAGE2_UPGRADES, game.stage2Upgrades] },
            3: { name: 'Foundry', rate: () => getPartsPerSecond(),
                 active: () => ({ reward: engineProfit(), period: engineDuration() }),
                 table: () => [STAGE3_UPGRADES, game.stage3Upgrades] },
            4: { name: 'Relay', rate: () => getCircuitsPerSecond(),
                 active: () => ({ reward: fieldReward(false), period: fieldInterval() }),
                 table: () => [STAGE4_UPGRADES, game.stage4Upgrades] },
            5: { name: 'Citadel', rate: () => getCoresPerSecond(),
                 active: () => ({ reward: coreChannelReward(), period: 1000 }),
                 table: () => [STAGE5_UPGRADES, game.stage5Upgrades] }
        };
        window.__freshZone = stage => {
            game.salvage = 0; game.totalSalvage = 0; game.rebirths = 0; game.cityTech.critChance = 0;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 0, salvageAccelerator: 0, salvageMagnet: 0,
                dropScanner: 0, campEfficiency: 0, workforceTraining: 0, housingBlocks: 0,
                communityHub: 0, critChance: 0, momentumCoil: 0, pulseTool: 0, clickAmplifier: 0 };
            game.rebirthUpgrades = { efficient: 0, headStart: 0, cheapBuild: 0 };
            for (let s = 2; s <= 5; s++) {
                game['stage' + s + 'Unlocked'] = s <= stage;
                game['stage' + s + 'Resets'] = 0;
                for (const k of Object.keys(game['stage' + s + 'Upgrades'])) game['stage' + s + 'Upgrades'][k] = 0;
                for (const k of Object.keys(game['stage' + s + 'ResetUpgrades'])) game['stage' + s + 'ResetUpgrades'][k] = 0;
            }
            for (const c of ['scrap', 'parts', 'circuits', 'cores']) game[c] = 0;
            game.adventure.progression.infrastructure = {};
            game.adventure.progression.beaconModules = 0; game.adventure.progression.relayTowers = 0;
            game.adventure.collection = {}; game.adventure.equipped = { 1: [], 2: [], 3: [], 4: [], 5: [] };
            game.adventure.bossDefeated = false; game.adventure.bossHealth = 100;
            game.economy.legacyOutput = 0; game.economy.legacyProduction = 1; game.economy.legacyPopulation = 0;
        };
        window.__walk = (stage, steps) => {
            const z = window.__zone[stage];
            const income = () => { const a = z.active(); return z.rate() + (a.period > 0 ? a.reward / (a.period / 1000) : 0); };
            const trace = [];
            let t = 0;
            for (let i = 0; i < steps; i++) {
                const before = income(), opts = [];
                const probe = (apply, undo, meta) => { apply(); const after = income(); undo(); if (after > before) opts.push({ ...meta, gain: after - before }); };
                if (z.buildings) for (const [key, def] of Object.entries(BUILDINGS)) {
                    const owned = game.buildings[key] || 0;
                    if (def.max && owned >= def.max) continue;
                    if (key === 'power' && owned >= 25) continue;
                    probe(() => game.buildings[key] = owned + 1, () => game.buildings[key] = owned,
                        { kind: 'b', key, cost: getBuildingCost(key) });
                }
                for (const [key, def] of Object.entries(INFRASTRUCTURE[stage] || {})) {
                    const lv = infrastructureLevel(key);
                    if (lv >= def.max) continue;
                    probe(() => game.adventure.progression.infrastructure[key] = lv + 1,
                          () => game.adventure.progression.infrastructure[key] = lv,
                        { kind: 'i', key, cost: infrastructureCost(def, lv) });
                }
                const [table, state] = z.table();
                for (const [key, def] of Object.entries(table)) {
                    const lv = state[key] || 0;
                    if (def.max && lv >= def.max) continue;
                    probe(() => state[key] = lv + 1, () => state[key] = lv,
                        { kind: 'u', key, cost: economyUpgradeCost(def, lv) });
                }
                const usable = opts.filter(o => Number.isFinite(o.cost) && o.cost > 0);
                if (!usable.length) break;
                usable.sort((a, b) => (a.cost / a.gain) - (b.cost / b.gain));
                const pick = usable[0];
                const wait = pick.cost / Math.max(before, 1e-9);
                t += wait;
                if (pick.kind === 'b') game.buildings[pick.key]++;
                else if (pick.kind === 'i') game.adventure.progression.infrastructure[pick.key] = infrastructureLevel(pick.key) + 1;
                else z.table()[1][pick.key] = (z.table()[1][pick.key] || 0) + 1;
                trace.push({ wait, t, income: income() });
            }
            return trace;
        };
    };

    // Targets from the brief: regular purchases in tens of seconds, important
    // ones in minutes, nothing instant and nothing that strands the player.
    const BOUNDS = {
        1: { minAvg: 4, maxAvg: 90, maxLongest: 420, maxJump: 2.6 },
        2: { minAvg: 4, maxAvg: 90, maxLongest: 300, maxJump: 2.2 },
        3: { minAvg: 4, maxAvg: 90, maxLongest: 300, maxJump: 2.2 },
        4: { minAvg: 4, maxAvg: 90, maxLongest: 300, maxJump: 2.2 },
        5: { minAvg: 4, maxAvg: 120, maxLongest: 300, maxJump: 2.2 }
    };

    for (const stage of [1, 2, 3, 4, 5]) {
        test("zone " + stage + " paces its whole purchase path", async () => {
            const page = await openPage();
            await startGame(page);
            await page.evaluate(ZONE_SIM);
            const r = await page.evaluate(stage => {
                window.__freshZone(stage);
                const start = window.__zone[stage].rate();
                const trace = window.__walk(stage, 60);
                const waits = trace.map(x => x.wait);
                const jumps = trace.map((x, i) => i > 0 ? x.income / trace[i - 1].income : 1);
                return { name: window.__zone[stage].name, start, steps: trace.length,
                         avg: waits.reduce((a, b) => a + b, 0) / waits.length,
                         longest: Math.max(...waits), maxJump: Math.max(...jumps),
                         total: trace[trace.length - 1].t, end: trace[trace.length - 1].income };
            }, stage);
            const b = BOUNDS[stage];
            assert.ok(r.steps >= 30, r.name + " must offer a long purchase path, got " + r.steps + " steps");
            assert.ok(r.avg >= b.minAvg, r.name + " purchases must not be instant: average wait " + r.avg.toFixed(1) + "s");
            assert.ok(r.avg <= b.maxAvg, r.name + " purchases must not be a grind: average wait " + r.avg.toFixed(1) + "s");
            assert.ok(r.longest <= b.maxLongest,
                r.name + " must never strand the player: longest wait " + Math.round(r.longest) + "s");
            assert.ok(r.maxJump <= b.maxJump,
                r.name + " no single purchase may multiply production by " + r.maxJump.toFixed(2));
            await page.close();
        });
    }

    test("no zone leaves the player with nothing to do for ten minutes", async () => {
        const page = await openPage();
        await startGame(page);
        await page.evaluate(ZONE_SIM);
        const worst = await page.evaluate(() => {
            const out = [];
            for (const stage of [1, 2, 3, 4, 5]) {
                window.__freshZone(stage);
                const trace = window.__walk(stage, 60);
                out.push({ stage, longest: Math.max(...trace.map(x => x.wait)) });
            }
            return out;
        });
        for (const w of worst) {
            assert.ok(w.longest < 600,
                "zone " + w.stage + " has a " + Math.round(w.longest) + "s dead period");
        }
        await page.close();
    });

    test("every zone's drive upgrade costs more than the building it multiplies", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => ({
            ashfall: { drive: TECH_UPGRADES.salvageAccelerator.baseCost, building: BUILDINGS.scavenger.baseCost },
            depot: { drive: STAGE2_UPGRADES.scrapRate.cost, building: INFRASTRUCTURE[2].depotCamp.cost },
            foundry: { drive: STAGE3_UPGRADES.partRate.cost, building: INFRASTRUCTURE[3].assemblyLine.cost },
            relay: { drive: STAGE4_UPGRADES.circuitRate.cost, building: INFRASTRUCTURE[4].signalExtractor.cost },
            citadel: { drive: STAGE5_UPGRADES.coreRate.cost, building: INFRASTRUCTURE[5].coreExtractor.cost }
        }));
        // A drive multiplies the whole zone. Priced below the zone's first
        // building, it is simply bought out the moment it appears.
        for (const [zone, v] of Object.entries(r)) {
            assert.ok(v.drive >= v.building * 2,
                zone + "'s drive (" + v.drive + ") must cost at least twice its first building (" + v.building + ")");
        }
        await page.close();
    });

    test("infrastructure prices rise faster than infrastructure pays", async () => {
        const page = await openPage();
        await startGame(page);
        const lines = await page.evaluate(() => Object.entries(INFRASTRUCTURE).flatMap(([stage, defs]) =>
            Object.entries(defs).map(([key, def]) => ({
                stage, key, growth: def.growth, reward: def.multiplier || 1.26
            }))));
        for (const line of lines) {
            assert.ok(line.growth > line.reward * 1.1,
                line.key + " prices at " + line.growth + " while paying " + line.reward +
                " — a line whose cost grows no faster than its reward is infinitely profitable");
        }
        await page.close();
    });
});

suite("Browser · resets, synergy and the ceiling", ({ test }) => {

    test("resets stay linear in every zone and never compound", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            const out = {};
            for (const stage of [1, 2, 3, 4, 5]) {
                const at = n => { if (stage === 1) game.rebirths = n; else game['stage' + stage + 'Resets'] = n; return renewalGroup(stage); };
                out[stage] = { v0: at(0), v1: at(1), v5: at(5), v10: at(10), v25: at(25), v40: at(40) };
                at(0);
            }
            return out;
        });
        for (const [stage, v] of Object.entries(r)) {
            const step = stage === '1' ? 0.5 : 0.35;
            assert.close(v.v1, 1 + step, 1e-9, "zone " + stage + ": one reset is +" + (step * 100) + "%");
            assert.close(v.v10, 1 + step * 10, 1e-9, "zone " + stage + ": ten resets stay linear");
            assert.close(v.v40, 1 + step * 40, 1e-9, "zone " + stage + ": forty resets stay linear");
            // Every reset must be worth the same as the first - the property
            // that makes repeated resets worthwhile without exploding.
            assert.close(v.v25 - v.v10, (v.v10 - v.v5) * (15 / 5), 1e-9,
                "zone " + stage + ": the step never grows with the count");
            assert.ok(v.v40 < 25, "zone " + stage + ": forty resets must not reach 25x");
        }
        await page.close();
    });

    test("later-zone resets never leak into earlier-zone production", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.buildings = { scavenger: 20, shelter: 10, workshop: 8, power: 3, citycenter: 0 };
            game.rebirths = 0;
            for (const s of [2, 3, 4, 5]) { game['stage' + s + 'Unlocked'] = true; game['stage' + s + 'Resets'] = 0; }
            const before = getSalvagePerSecond();
            for (const s of [2, 3, 4, 5]) game['stage' + s + 'Resets'] = 40;
            return { before, after: getSalvagePerSecond() };
        });
        assert.close(r.after, r.before, Math.max(1e-9, r.before * 1e-9),
            "40 resets in every later zone must not change Ashfall production at all");
        await page.close();
    });

    test("cross-stage synergy accumulates additively and stays controlled", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.buildings = { scavenger: 20, shelter: 10, workshop: 8, power: 3, citycenter: 0 };
            game.rebirths = 0;
            for (const s of [2, 3, 4, 5]) { game['stage' + s + 'Unlocked'] = false; game['stage' + s + 'Resets'] = 0; }
            game.stage2Upgrades.salvageBoost = 0; game.stage2ResetUpgrades.salvageBoost2 = 0;
            const read = () => ({ rate: getSalvagePerSecond(), synergy: synergyGroup(1) });
            const o = { alone: read() };
            game.stage2Unlocked = true; o.depot = read();
            game.stage3Unlocked = true; o.foundry = read();
            game.stage4Unlocked = true; o.relay = read();
            game.stage5Unlocked = true; o.all = read();
            return o;
        });
        assert.close(r.depot.rate / r.alone.rate, 1.10, 0.001, "Ashfall + Depot is +10%");
        assert.close(r.foundry.rate / r.alone.rate, 1.22, 0.001, "+ Foundry is +22%");
        assert.close(r.relay.rate / r.alone.rate, 1.37, 0.001, "+ Relay is +37%");
        assert.close(r.all.rate / r.alone.rate, 1.57, 0.001, "all five zones is +57%");
        // Additive, not multiplicative: 1.10 x 1.12 x 1.15 x 1.20 would be 1.70.
        assert.ok(r.all.rate / r.alone.rate < 1.6,
            "zone bonuses must add, not compound: got x" + (r.all.rate / r.alone.rate).toFixed(3));
        await page.close();
    });

    test("a fully completed account stays inside the readable ceiling", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.rebirths = 40; game.rebirthUpgrades.efficient = 20;
            game.buildings = { scavenger: 30, shelter: 120, workshop: 60, power: 25, citycenter: 20 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 40, salvageAccelerator: 40, salvageMagnet: 5,
                campEfficiency: 20, workforceTraining: 10, housingBlocks: 5, communityHub: 1 };
            for (let s = 2; s <= 5; s++) { game['stage' + s + 'Unlocked'] = true; game['stage' + s + 'Resets'] = 40; }
            // Every zone's drive, or the zones left at level 0 look two orders
            // of magnitude behind and the spread check reports a phantom gap.
            game.stage2Upgrades.scrapRate = 40; game.stage3Upgrades.partRate = 40;
            game.stage4Upgrades.circuitRate = 40; game.stage5Upgrades.coreRate = 40;
            game.stage2Upgrades.salvageBoost = 20; game.stage3Upgrades.scrapBoost = 20;
            game.stage4Upgrades.partBoost = 20; game.stage5Upgrades.totalCircuit = 20;
            game.stage2ResetUpgrades.salvageBoost2 = 20; game.stage2ResetUpgrades.settlementLegacy = 1;
            game.stage5ResetUpgrades.lastCity = 1;
            for (const defs of Object.values(INFRASTRUCTURE))
                for (const [k, d] of Object.entries(defs)) game.adventure.progression.infrastructure[k] = d.max;
            game.adventure.progression.beaconModules = 3; game.adventure.bossDefeated = true;
            // A completed account has also finished the research tree, which
            // multiplies every zone. Leaving it out understated the real
            // ceiling by about four times.
            const research = window.LastCityExpansion?.moduleFor?.("research");
            const state = window.LastCityExpansion?.state?.();
            if (research?.TREE && state) {
                for (const node of Object.values(research.TREE)) {
                    const id = node && node.id;
                    if (id) state.research.unlocked[id] = true;
                }
                for (const key of Object.keys(research.TREE)) state.research.unlocked[key] = true;
            }
            const rates = { salvage: getSalvagePerSecond(), scrap: getScrapPerSecond(),
                            parts: getPartsPerSecond(), circuits: getCircuitsPerSecond(), cores: getCoresPerSecond() };
            return { rates, shown: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, formatNumber(v)])),
                     research: expansionMultiplier(1), ceiling: ECONOMY_MULTIPLIER_CEILING };
        });
        for (const [name, rate] of Object.entries(r.rates)) {
            assert.ok(Number.isFinite(rate), name + " must stay finite");
            assert.ok(rate < 1e13, "completed " + name + " must stay under 1e13, was " + rate.toExponential(2));
            // The safety net is for corrupt values, not for balance. If real
            // play reaches it, the economy is wrong and the number is a lie.
            assert.ok(rate < r.ceiling / 100,
                "completed " + name + " (" + rate.toExponential(2) + ") must stay far below the safety clamp");
            assert.notOk(/e\+?\d/i.test(r.shown[name]), name + " must read as a unit, got " + r.shown[name]);
        }
        assert.ok(r.research > 1.5,
            "the completed-account fixture must actually include the research tree, got x" + r.research);
        // No zone may be orders of magnitude adrift from the others.
        const values = Object.values(r.rates);
        assert.ok(Math.max(...values) / Math.min(...values) < 100,
            "zones must finish within two orders of magnitude of each other");
        await page.close();
    });

    test("the Guardian is priced against the Citadel it is fought in", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.stage5Unlocked = true;
            game.adventure.progression.infrastructure = {}; game.stage5Upgrades.coreRate = 0;
            game.adventure.bossHealth = 100;
            const early = { rate: getCoresPerSecond(), shot: cannonCost() };
            for (const [k, d] of Object.entries(INFRASTRUCTURE[5])) game.adventure.progression.infrastructure[k] = d.max;
            game.stage5Upgrades.coreRate = 40; game['stage5Resets'] = 20;
            const built = { rate: getCoresPerSecond(), shot: cannonCost() };
            game.adventure.bossHealth = 25;
            const finalShot = cannonCost();
            game.adventure.bossHealth = 100;
            return { early, built, finalShot };
        });
        assert.ok(r.early.shot >= 100, "an early Citadel still pays the original floor");
        assert.ok(r.built.shot > r.early.shot * 100,
            "a built-out Citadel pays far more: the fight must not be a flat 100 Cores");
        assert.ok(r.built.shot / r.built.rate > 30,
            "the first shot must cost real time, was " + (r.built.shot / r.built.rate).toFixed(1) + "s");
        assert.ok(r.finalShot / r.built.rate > 180,
            "the last shot must be a genuine objective, was " + (r.finalShot / r.built.rate).toFixed(0) + "s");
        await page.close();
    });
});

suite("Browser · later-stage old saves and guidance", ({ test }) => {

    const DEEP_OLD = JSON.stringify({
        salvage: 8.4e30, scrap: 2.2e28, parts: 9e26, circuits: 4e25, cores: 7e24,
        totalSalvage: 5e31, lifetimeSalvage: 9e31, highestSalvageRate: 3e27,
        shards: 9e9, scrapTokens: 4e8, ascensionTokens: 5e8,
        rebirths: 44, stage2Resets: 60, stage3Resets: 55, stage4Resets: 48, stage5Resets: 37,
        introSeen: true,
        buildings: { scavenger: 400, shelter: 300, workshop: 180, power: 90, citycenter: 40, farm: 60, factory: 45 },
        cityTech: { sturdyGloves: 90, salvageAccelerator: 85, salvageMagnet: 12, campEfficiency: 60 },
        rebirthUpgrades: { efficient: 60, legacy: 1, fastHands: 900, autoClicker: 200 },
        stage2Unlocked: true, stage3Unlocked: true, stage4Unlocked: true, stage5Unlocked: true,
        stage2Upgrades: { scrapRate: 95, salvageBoost: 60, deepSalvage: 40 },
        stage2ResetUpgrades: { salvageBoost2: 50, settlementLegacy: 1, autoScavenge: 1 },
        stage3Upgrades: { partRate: 95, scrapBoost: 60 },
        stage4Upgrades: { circuitRate: 95, partBoost: 60 },
        stage5Upgrades: { coreRate: 95, totalCircuit: 60, totalSalvage: 40, ascension: 1 },
        stage5ResetUpgrades: { lastCity: 1, ascensionLegacy: 1 },
        adventure: { bossDefeated: true, keys: 5, deliveries: 400,
            collection: { '1-4': 9 }, equipped: { 1: ['1-4'] },
            progression: { beaconModules: 3, relayTowers: 3, fieldCollected: 4000,
                infrastructure: { depotCamp: 90, sortingMill: 80, assemblyLine: 75, machineShop: 70,
                                  signalExtractor: 88, capacitorBank: 66, coreExtractor: 95, reactorConduit: 84 } } },
        economy: { version: 3, legacyOutput: 90000, legacyPopulation: 400, legacyProduction: 3.9,
                   legacyUpgradeMultipliers: { salvageAccelerator: 42, scrapRate: 38 }, legacyFlatLevels: {} },
        glyphs: { version: 3, research: { luck: 40, more: 30, speed: 25 } }
    });

    test("an old save with progress in all five zones is normalized everywhere", async () => {
        const page = await openPage({ seedSave: DEEP_OLD });
        const r = await page.evaluate(() => ({
            rates: { salvage: getSalvagePerSecond(), scrap: getScrapPerSecond(), parts: getPartsPerSecond(),
                     circuits: getCircuitsPerSecond(), cores: getCoresPerSecond() },
            shown: formatNumber(getSalvagePerSecond()),
            kept: { rebirths: game.rebirths, s2: game.stage2Resets, s5: game.stage5Resets,
                    boss: game.adventure.bossDefeated, beacons: game.adventure.progression.beaconModules,
                    towers: game.adventure.progression.relayTowers, pets: game.adventure.collection['1-4'],
                    glyphLuck: game.glyphs.research.luck },
            clamped: { camps: game.buildings.scavenger, drive: game.cityTech.salvageAccelerator,
                       scrapRate: game.stage2Upgrades.scrapRate,
                       depotCamp: game.adventure.progression.infrastructure.depotCamp,
                       coreExtractor: game.adventure.progression.infrastructure.coreExtractor,
                       capacitorBank: game.adventure.progression.infrastructure.capacitorBank },
            legacy: { production: game.economy.legacyProduction,
                      upgrade: game.economy.legacyUpgradeMultipliers.salvageAccelerator },
            retired: { deepSalvage: game.stage2Upgrades.deepSalvage, totalSalvage: game.stage5Upgrades.totalSalvage,
                       ascension: game.stage5Upgrades.ascension, legacy: game.rebirthUpgrades.legacy },
            automation: game.stage2ResetUpgrades.autoScavenge,
            ceiling: ECONOMY_MULTIPLIER_CEILING
        }));
        // Legitimate progression survives.
        assert.equal(r.kept.rebirths, 44, "renewals are progression");
        assert.equal(r.kept.s2, 60, "zone resets are progression");
        assert.equal(r.kept.boss, true, "a defeated Guardian stays defeated");
        assert.equal(r.kept.beacons, 3, "beacon modules are kept");
        assert.equal(r.kept.towers, 3, "relay towers are kept");
        assert.equal(r.kept.pets, 9, "companions are kept");
        assert.equal(r.kept.glyphLuck, 40, "glyph research is kept");
        assert.equal(r.automation, 1, "automation is a convenience and is kept");
        // Impossible values come down to what this build can reach.
        assert.equal(r.clamped.camps, 30, "over-cap buildings are clamped");
        assert.equal(r.clamped.drive, 40, "over-cap upgrades are clamped");
        assert.equal(r.clamped.scrapRate, 40, "over-cap zone upgrades are clamped");
        assert.equal(r.clamped.depotCamp, 25, "over-cap zone infrastructure is clamped");
        assert.equal(r.clamped.coreExtractor, 25, "in every zone");
        assert.equal(r.clamped.capacitorBank, 25, "for multiplier lines too");
        // No deprecated multiplier survives.
        assert.equal(r.legacy.production, 1, "deprecated production conversion is dropped");
        assert.equal(r.legacy.upgrade, 1, "deprecated upgrade conversion is dropped");
        for (const [key, value] of Object.entries(r.retired)) {
            assert.equal(value, 0, "retired upgrade " + key + " must not survive");
        }
        // And the result is a playable economy, not a clamped one.
        for (const [name, rate] of Object.entries(r.rates)) {
            assert.ok(Number.isFinite(rate) && rate > 0, name + " must be a real number");
            assert.ok(rate < r.ceiling / 100,
                "normalized " + name + " must sit far below the safety clamp, was " + rate.toExponential(2));
        }
        assert.notOk(/e\+?\d/i.test(r.shown), "and reads as a unit: " + r.shown);
        await page.close();
    });

    test("every zone's unlock requirements are the ones the zone itself checks", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            const out = {};
            for (const stage of [1, 2, 3, 4]) {
                const items = zoneRequirements(stage);
                const objective = progressionObjective(stage);
                out[stage] = {
                    count: items.length,
                    labels: items.map(i => i.label),
                    ready: objective.ready,
                    agrees: objective.ready === items.every(i => i.have >= i.need)
                };
            }
            return out;
        });
        assert.equal(r[1].count, 2, "Ashfall has two requirements");
        assert.includes(r[1].labels.join(' '), "City Centers");
        assert.equal(r[2].count, 3, "Depot has three");
        assert.includes(r[2].labels.join(' '), "depot keys");
        assert.equal(r[3].count, 3, "Foundry has three");
        assert.includes(r[3].labels.join(' '), "engines");
        assert.equal(r[4].count, 2, "Relay has two");
        assert.includes(r[4].labels.join(' '), "Relay Towers");
        for (const [stage, v] of Object.entries(r)) {
            assert.ok(v.agrees, "zone " + stage + ": the panel and the zone must agree on readiness");
            assert.notOk(v.ready, "zone " + stage + ": a fresh city has not met them");
        }
        await page.close();
    });

    test("the next objective advances through Ashfall and never repeats itself", async () => {
        const page = await openPage();
        await startGame(page);
        const seen = await page.evaluate(() => {
            game.salvage = 0; game.totalSalvage = 0; game.rebirths = 0;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 0, salvageAccelerator: 0, salvageMagnet: 0 };
            game.adventure.progression.beaconModules = 0;
            for (const s of [2, 3, 4, 5]) game['stage' + s + 'Unlocked'] = false;
            currentStageView = 1;
            const titles = [];
            const push = () => { const g = firstCityGuide(); if (g) titles.push(g.title); };
            push();
            game.buildings.scavenger = 1; push();
            game.cityTech.sturdyGloves = 1; push();
            game.cityTech.salvageAccelerator = 1; push();
            game.buildings.shelter = 1; push();
            game.buildings.workshop = 1; push();
            game.buildings.power = 1; push();
            game.cityTech.salvageMagnet = 1; push();
            game.buildings.citycenter = 1; push();
            return titles;
        });
        assert.equal(seen.length, 9, "every step of the opening gives guidance");
        assert.equal(new Set(seen).size, 9, "and never repeats a step the player has done: " + seen.join(' | '));
        assert.includes(seen[0], "Scavenger Camp");
        assert.includes(seen.join(' '), "Restore power");
        assert.includes(seen.join(' '), "Automate");
        assert.includes(seen[7], "City Center");
        assert.includes(seen[8], "beacon");
        await page.close();
    });
});

// =============================================
// Presentation, rewards and identity
// =============================================
suite("Browser · polish", ({ test }) => {

    test("no hardcoded reward lets a player skip a progression section", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            // Each reward measured against the economy at the moment it is earned.
            const out = {};
            const campsFor = amount => {
                const owned = game.buildings.scavenger;
                let spent = 0, camps = 0;
                while (spent + getBuildingCost('scavenger') <= amount) { spent += getBuildingCost('scavenger'); game.buildings.scavenger++; camps++; }
                game.buildings.scavenger = owned;
                return camps;
            };
            // Opening: First Shift fires at 25 gathers.
            game.salvage = 0; game.totalSalvage = 0; game.totalClicks = 25;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 0, salvageAccelerator: 0, salvageMagnet: 0 };
            for (const st of [2, 3, 4, 5]) game['stage' + st + 'Unlocked'] = false;
            game.salvage = 0; CONTRACTS.firstShift.claim();
            out.firstShift = { paid: game.salvage, camps: campsFor(game.salvage) };
            // Growing City fires at 2,500 lifetime.
            game.salvage = 0; game.totalSalvage = 2500; CONTRACTS.growingCity.claim();
            out.growingCity = { paid: game.salvage, ratio: game.salvage / 2500 };
            // Guardian victory, against a built-out Citadel.
            game.stage5Unlocked = true;
            for (const [k, d] of Object.entries(INFRASTRUCTURE[5])) game.adventure.progression.infrastructure[k] = d.max;
            game.stage5Upgrades.coreRate = 40;
            const coreRate = getCoresPerSecond();
            out.guardian = { prize: Math.max(300, Math.ceil(coreRate * 120)), rate: coreRate };
            return out;
        });
        assert.ok(r.firstShift.camps <= 3,
            "First Shift buys " + r.firstShift.camps + " camps outright — it must not replace the opening loop");
        assert.ok(r.firstShift.paid >= 15, "but it must still be worth claiming");
        assert.ok(r.growingCity.ratio <= 0.5,
            "Growing City pays " + (r.growingCity.ratio * 100).toFixed(0) + "% of the total that earned it");
        // The game's final victory must not pay less than a second of the
        // player's own production.
        assert.ok(r.guardian.prize > r.guardian.rate * 60,
            "the Guardian prize (" + r.guardian.prize.toExponential(2) + ") must scale with Citadel output");
        await page.close();
    });

    test("the rebirth board can actually be completed", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            let board = 0;
            for (const def of Object.values(REBIRTH_UPGRADES))
                for (let lv = 0; lv < (def.max || 1); lv++) board += economyUpgradeCost(def, lv);
            let shards = 3;
            game.buildings = { scavenger: 30, shelter: 16, workshop: 12, power: 5, citycenter: 4 };
            for (let n = 1; n <= 40; n++) { game.rebirths = n; shards += calculateRebirthShards(); }
            game.rebirths = 0;
            return { board, shardsAt40: shards };
        });
        // A visible upgrade track whose top levels can never be bought is a
        // dead end, not scarcity. The board was 19x over-funded against income.
        assert.ok(r.board < r.shardsAt40 * 4,
            "the rebirth board costs " + r.board + " Shards against " + r.shardsAt40 +
            " earned in forty renewals — its top levels would be unreachable");
        assert.ok(r.board > r.shardsAt40,
            "but it must still be a long-term goal, not finished at forty renewals");
        await page.close();
    });

    test("Upgrade Specialist is reachable during normal progression", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.rebirths = 0;
            game.buildings = { scavenger: 30, shelter: 16, workshop: 12, power: 5, citycenter: 1 };
            game.cityTech = { ...game.cityTech, salvageAccelerator: 6, sturdyGloves: 0 };
            const rate = getSalvagePerSecond();
            let toTarget = 0;
            for (let lv = 0; lv < 30; lv++) toTarget += economyUpgradeCost(TECH_UPGRADES.sturdyGloves, lv);
            game.cityTech.sturdyGloves = 29;
            const atTwentyNine = ACHIEVEMENTS.fieldSpecialist.check();
            game.cityTech.sturdyGloves = 30;
            const atThirty = ACHIEVEMENTS.fieldSpecialist.check();
            return { rate, toTarget, atTwentyNine, atThirty, desc: ACHIEVEMENTS.fieldSpecialist.desc };
        });
        assert.includes(r.desc, "level 30", "the achievement says what it now wants");
        assert.notOk(r.atTwentyNine, "level 29 is not enough");
        assert.ok(r.atThirty, "level 30 earns it");
        const minutes = r.toTarget / r.rate / 60;
        assert.ok(minutes < 180, "it must be reachable in normal play, takes " + minutes.toFixed(0) + " minutes");
        assert.ok(minutes > 5, "but must not be trivial, takes " + minutes.toFixed(0) + " minutes");
        await page.close();
    });

    test("opening a zone shows a panel carrying the real bonus", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(async () => {
            game.stage2Unlocked = true; renderPlayerUI();
            await new Promise(resolve => setTimeout(resolve, 500));
            const d = document.getElementById('zoneUnlockModal');
            const out = { open: !!d?.open, title: d?.querySelector('h2')?.textContent,
                adds: [...(d?.querySelectorAll('.zone-unlock-adds li') || [])].length,
                benefit: d?.querySelector('.zone-unlock-benefit')?.textContent || '',
                actual: Math.round(STAGE_SYNERGY[2].production * 100) };
            d?.querySelector('#zoneUnlockEnter')?.click();
            await new Promise(resolve => setTimeout(resolve, 200));
            out.entered = currentStageView;
            return out;
        });
        assert.ok(r.open, "opening a zone must be more than a toast");
        assert.includes(r.title, "DEPOT");
        assert.ok(r.adds >= 2, "the panel lists what the zone adds");
        assert.includes(r.benefit, "+" + r.actual + "%",
            "the advertised bonus must be the one STAGE_SYNERGY actually pays");
        assert.equal(r.entered, 2, "the button takes the player into the zone");
        await page.close();
    });

    test("the civilisation bonus panel never shows a number the economy does not pay", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            currentStageView = 1;
            game.stage2Unlocked = true; game.stage3Unlocked = true;
            game.stage4Unlocked = false; game.stage5Unlocked = false;
            const rows = supplyNetworkRows();
            const find = needle => rows.find(row => row[0].includes(needle));
            return {
                total: find('Total from restored')?.[1],
                combined: find('All civilisation bonuses')?.[1],
                relay: find('Relay')?.[1],
                actualBonus: '+' + Math.round(stageSynergyBonus(1) * 100) + '%',
                actualGroup: '×' + synergyGroup(1).toFixed(2)
            };
        });
        assert.equal(r.total, r.actualBonus, "the displayed zone bonus is the live one");
        assert.equal(r.combined, r.actualGroup, "the displayed total is the live synergy group");
        assert.includes(r.relay, "Restore", "a zone not yet restored is shown as locked, not as a bonus");
        await page.close();
    });

    test("every zone states what it is for, in one vocabulary", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            const out = {};
            for (const stage of [1, 2, 3, 4, 5]) {
                out[stage] = { name: ZONES[stage].name, theme: ZONES[stage].theme,
                               purpose: ZONES[stage].purpose, next: ZONES[stage].next };
            }
            out.achievements = [ACHIEVEMENTS.industrial.desc, ACHIEVEMENTS.networkArchitect.desc,
                                ACHIEVEMENTS.ascendant.desc];
            return out;
        });
        for (const stage of [1, 2, 3, 4, 5]) {
            assert.ok(r[stage].theme && r[stage].theme.length > 5, "zone " + stage + " states its theme");
            assert.ok(r[stage].purpose && r[stage].purpose.length > 10, "zone " + stage + " states its purpose");
        }
        // The old names (The Settlement, The Industry, The Network, The
        // Ascension) must not reappear anywhere a player can read.
        const vocabulary = [...[1, 2, 3, 4].map(s => r[s].next), ...r.achievements].join(' ');
        for (const stale of ['The Settlement', 'The Industry', 'The Network', 'The Ascension']) {
            assert.notOk(vocabulary.includes(stale), "retired name still shown to players: " + stale);
        }
        await page.close();
    });

    test("the guide covers every system the brief asks for", async () => {
        const page = await openPage();
        await startGame(page);
        const sections = await page.evaluate(async () => {
            document.getElementById('guideButton').click();
            await new Promise(resolve => setTimeout(resolve, 200));
            return [...document.querySelectorAll('.guide-section h3')].map(h => h.textContent.replace('???', '').trim());
        });
        for (const needed of ['Getting Started', 'Resources', 'City', 'Buildings', 'Power', 'Food',
                              'Workers', 'Research', 'Upgrades', 'Stages', 'Rebirth / Renewal',
                              'Glyphs', 'Companions', 'Saving', 'Guest Mode', 'Controls',
                              'Civilisation Bonuses']) {
            assert.includes(sections.join(' | '), needed, "guide is missing: " + needed);
        }
        await page.close();
    });
});

// =============================================
// Reconstruction Level
//
// Two properties have to hold at once, and they pull against each other:
// a hoarder must not be able to dump a banked balance into the board, and a
// player buying at a natural pace must never be left with nothing to do.
// =============================================
suite("Browser · reconstruction level", ({ test }) => {

    test("a new city starts at level 1 with a full allowance", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => ({
            level: game.progress.level, xp: game.progress.xp,
            allowance: allowanceLeft(), cap: allowanceCap(),
            label: document.getElementById('levelLabel')?.textContent,
            shown: document.getElementById('levelAllowance')?.textContent
        }));
        assert.equal(r.level, 1);
        assert.equal(r.xp, 0);
        assert.equal(r.allowance, r.cap, "a new city starts at its ceiling");
        assert.equal(r.label, "LEVEL 1", "the wallet shows the level");
        assert.includes(r.shown, "6", "and the builds in hand");
        await page.close();
    });

    test("gathering by hand earns XP but idling does not", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(async () => {
            game.cityTech.critChance = 0;
            game.progress = normalizeProgress(null);
            const button = document.getElementById('energyButton');
            for (let i = 0; i < 15; i++) { button.click(); await new Promise(r => setTimeout(r, 85)); }
            const afterGathering = game.progress.xp;
            // Now idle: production runs, the clock advances, no XP.
            // Operator milestones are seeded as already seen so a threshold
            // crossing is not mistaken for idle drift.
            game.operator.seen = Object.fromEntries(OPERATOR_LINES.map(l => [l.id, true]));
            game.buildings.scavenger = 50;
            renderPlayerUI();
            const before = game.progress.xp;
            await new Promise(r => setTimeout(r, 1500));
            return { afterGathering, drift: game.progress.xp - before };
        });
        assert.ok(r.afterGathering >= 15, "hand gathering earns XP, got " + r.afterGathering);
        assert.equal(r.drift, 0, "idle production must not earn XP — that is what makes the limit bite on hoarders");
        await page.close();
    });

    test("MAX cannot dump a banked balance into the board", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            const frozen = Date.now(), realNow = Date.now;
            game.salvage = 1e12;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.progress = normalizeProgress(null);
            game.progress.allowance = allowanceCap();
            game.operator.seen = { firstCamp: 1, firstWorkshop: 1, firstPower: 1, firstCityCentre: 1, population: 1 };
            game.buyAmount = 'max';
            Date.now = () => frozen;              // nothing refills during the burst
            let placed = 0;
            for (let i = 0; i < 30; i++) {
                const before = game.buildings.scavenger;
                buyBuilding('scavenger');
                const got = game.buildings.scavenger - before;
                if (!got) break;
                placed += got;
            }
            const out = { placed, cap: allowanceCap(), left: Math.floor(game.progress.allowance),
                          salvageLeft: game.salvage };
            Date.now = realNow;
            return out;
        });
        // Scavenger Camps cap at 30 and MAX used to buy 25 of them in one press.
        assert.equal(r.placed, r.cap,
            "a burst must be exactly the allowance (" + r.cap + "), got " + r.placed);
        assert.ok(r.placed <= 12, "and must stay far below the 25 MAX used to buy");
        assert.equal(r.left, 0, "the burst spends the allowance rather than refunding it");
        assert.ok(r.salvageLeft > 1e11, "the Salvage is still there — it is the allowance that ran out, not the money");
        await page.close();
    });

    test("buying does not refund the allowance it just spent", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            const frozen = Date.now(), realNow = Date.now;
            game.salvage = 1e12;
            game.progress = normalizeProgress(null);
            game.progress.allowance = allowanceCap();
            game.operator.seen = { firstCamp: 1, firstWorkshop: 1, firstPower: 1, firstCityCentre: 1, population: 1 };
            game.buyAmount = 'max';
            Date.now = () => frozen;
            const before = { level: game.progress.level, allowance: Math.floor(game.progress.allowance) };
            buyBuilding('scavenger');
            const after = { level: game.progress.level, allowance: Math.floor(game.progress.allowance) };
            Date.now = realNow;
            return { before, after, perOrder: XP_REWARDS.building };
        });
        // Paying XP per BUILDING meant a batch of six granted 72 XP, levelled
        // the player, and handed back five allowance — the reward refunding
        // the limit it existed to enforce.
        assert.ok(r.after.allowance < r.before.allowance,
            "a build order must leave less allowance than it started with");
        assert.ok(r.perOrder < 60, "one order must not be worth a whole level on its own");
        await page.close();
    });

    test("allowance refills on a timer and is capped", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.progress = normalizeProgress(null);
            game.progress.allowance = 0;
            game.progress.lastRefill = Date.now() - 9000;
            const atNine = allowanceLeft();
            game.progress.allowance = 0;
            game.progress.lastRefill = Date.now() - 35000;
            const atThirtyFive = allowanceLeft();
            game.progress.allowance = 0;
            game.progress.lastRefill = Date.now() - 3600000;   // an hour away
            const afterAnHour = allowanceLeft();
            return { atNine, atThirtyFive, afterAnHour, cap: allowanceCap() };
        });
        assert.equal(r.atNine, 0, "nothing arrives before the first tick");
        assert.equal(r.atThirtyFive, 3, "three ticks in thirty-five seconds");
        assert.equal(r.afterAnHour, r.cap,
            "an hour away returns a full allowance and no more — the trickle cannot bank into a second dump");
        await page.close();
    });

    test("levelling up grants allowance and announces itself", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            game.progress = normalizeProgress(null);
            game.progress.allowance = 0;
            const before = game.progress.level;
            grantXp('zone');                       // restoring a zone
            return { before, after: game.progress.level,
                     allowance: Math.floor(game.progress.allowance),
                     cap: allowanceCap(), perLevel: ALLOWANCE_PER_LEVEL };
        });
        assert.ok(r.after > r.before, "a big beat levels the player");
        assert.ok(r.allowance > 0, "and hands back allowance");
        assert.ok(r.allowance <= r.cap, "but never past the ceiling");
        await page.close();
    });

    test("every purchase route spends allowance", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            const frozen = Date.now(), realNow = Date.now;
            Date.now = () => frozen;
            // Unlock everything and silence the operator FIRST, so a
            // one-off milestone does not land inside a measured purchase.
            game.stage2Unlocked = true;
            game.operator.seen = Object.fromEntries(OPERATOR_LINES.map(l => [l.id, true]));
            const spend = fn => {
                game.progress = normalizeProgress(null);
                game.progress.allowance = 3;
                game.salvage = 1e12; game.scrap = 1e12;
                const before = Math.floor(game.progress.allowance);
                fn();
                return before - Math.floor(game.progress.allowance);
            };
            game.buyAmount = 1;
            const out = {
                building: spend(() => buyBuilding('scavenger')),
                cityTech: spend(() => buyTechUpgrade('sturdyGloves')),
                zoneUpgrade: spend(() => buyUpgrade(2, 'scrapRate')),
                infrastructure: spend(() => buyInfrastructure(2, 'depotCamp'))
            };
            Date.now = realNow;
            return out;
        });
        for (const [route, spent] of Object.entries(r)) {
            assert.ok(spent >= 1, route + " must cost build allowance, spent " + spent);
        }
        await page.close();
    });

    test("an existing save is credited a level rather than throttled", async () => {
        const veteran = JSON.stringify({
            saveVersion: 4, salvage: 5e6, totalSalvage: 9e7, rebirths: 12, introSeen: true,
            stage2Unlocked: true, stage3Unlocked: true,
            buildings: { scavenger: 30, shelter: 40, workshop: 30, power: 14, citycenter: 6 },
            cityTech: { salvageAccelerator: 18, sturdyGloves: 16 }
        });
        const page = await openPage({ seedSave: veteran });
        const r = await page.evaluate(() => ({
            level: game.progress.level, allowance: allowanceLeft(), cap: allowanceCap()
        }));
        assert.ok(r.level > 10,
            "a twelve-renewal city must not load at level 1, got " + r.level);
        assert.equal(r.allowance, r.cap, "and arrives with a full allowance");
        assert.ok(r.cap > 6, "whose ceiling reflects the level");
        await page.close();
    });

    test("normal play never runs out of things to do", async () => {
        const page = await openPage();
        await startGame(page);
        const r = await page.evaluate(() => {
            // Walk the real purchase path at the pace the economy allows and
            // count how often allowance, rather than Salvage, is the blocker.
            game.salvage = 0; game.totalSalvage = 0; game.rebirths = 0; game.cityTech.critChance = 0;
            game.buildings = { scavenger: 0, shelter: 0, workshop: 0, power: 0, citycenter: 0 };
            game.cityTech = { ...game.cityTech, sturdyGloves: 0, salvageAccelerator: 0, salvageMagnet: 0 };
            game.progress = normalizeProgress(null);
            const CLICKS = 5;
            const income = () => getSalvagePerSecond() + CLICKS * getClickPower() * getSalvageMultiplier();
            let t = 0, stalls = 0, purchases = 0;
            for (let i = 0; i < 60; i++) {
                const before = income(), opts = [];
                const probe = (apply, undo, meta) => { apply(); const after = income(); undo();
                    if (after > before) opts.push({ ...meta, gain: after - before }); };
                for (const [key, def] of Object.entries(BUILDINGS)) {
                    const owned = game.buildings[key] || 0;
                    if (def.max && owned >= def.max) continue;
                    probe(() => game.buildings[key] = owned + 1, () => game.buildings[key] = owned,
                        { b: key, cost: getBuildingCost(key) });
                }
                for (const [key, def] of Object.entries(TECH_UPGRADES)) {
                    const lv = game.cityTech[key] || 0;
                    if (def.max && lv >= def.max) continue;
                    probe(() => game.cityTech[key] = lv + 1, () => game.cityTech[key] = lv,
                        { u: key, cost: economyUpgradeCost(def, lv) });
                }
                const usable = opts.filter(o => Number.isFinite(o.cost) && o.cost > 0);
                if (!usable.length) break;
                usable.sort((a, b) => (a.cost / a.gain) - (b.cost / b.gain));
                const pick = usable[0];
                const wait = pick.cost / Math.max(before, 1e-9);
                t += wait;
                grantXp('gather', Math.floor(wait * CLICKS));
                game.progress.lastRefill -= wait * 1000;      // time passes
                if (allowanceLeft() < 1) stalls++;
                spendAllowance(1);
                if (pick.b) { game.buildings[pick.b]++; grantXp('building'); }
                else { game.cityTech[pick.u]++; grantXp('upgrade'); }
                purchases++;
            }
            return { purchases, stalls, minutes: t / 60, level: game.progress.level };
        });
        assert.ok(r.purchases >= 50, "the run should get a long way, made " + r.purchases + " purchases");
        assert.equal(r.stalls, 0,
            "a player buying at the pace the economy allows must never wait on allowance, stalled " +
            r.stalls + " times");
        assert.ok(r.level >= 8, "and should be levelling steadily, reached " + r.level);
        await page.close();
    });
});

suite("Browser · teardown", ({ test }) => {
    test("the shared browser and static server shut down", async () => {
        await shutdown();
        assert.ok(true);
    });
});

}
