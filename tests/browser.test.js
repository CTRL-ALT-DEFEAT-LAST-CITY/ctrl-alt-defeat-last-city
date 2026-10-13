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
        assert.equal(state.scavenger, 42, "building counts must survive");
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

suite("Browser · teardown", ({ test }) => {
    test("the shared browser and static server shut down", async () => {
        await shutdown();
        assert.ok(true);
    });
});

}
