// =============================================
// STATIC ANALYSIS TESTS
// ---------------------------------------------
// These catch the failure modes that actually break a GitHub Pages deploy:
// a syntax error, a stylesheet or script that is referenced but missing, an
// asset path with the wrong case, or an element id the JavaScript expects and
// the HTML does not provide.
// =============================================

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { suite, assert } = require("./harness");

const ROOT = path.resolve(__dirname, "..");

function read(relative) {
    return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(ROOT, relative));
}

// Walk the project, skipping the archived version folders (v2/v3/v3.2), which
// are historical snapshots and intentionally not maintained.
function walk(dir, filter, out = []) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (["v2", "v3", "v3.2", "node_modules", ".git", "dist"].includes(entry.name)) continue;
            walk(relative, filter, out);
        } else if (filter(entry.name)) {
            out.push(relative);
        }
    }
    return out;
}

const SHIPPED_JS = walk("src", name => name.endsWith(".js"));
const SHIPPED_CSS = walk("src", name => name.endsWith(".css"));
const INDEX = read("index.html");

suite("Static · JavaScript syntax", ({ test }) => {
    test("every shipped script parses", () => {
        const broken = [];
        for (const file of SHIPPED_JS) {
            try {
                execFileSync(process.execPath, ["--check", path.join(ROOT, file)], { stdio: "pipe" });
            } catch (error) {
                broken.push(file + ": " + String(error.stderr || error.message).split("\n")[0]);
            }
        }
        assert.deepEqual(broken, [], "scripts failed to parse");
    });

    test("no script uses ES module syntax (the page loads classic scripts)", () => {
        const offenders = [];
        for (const file of SHIPPED_JS) {
            const source = read(file);
            // A bare `export`/`import` statement at the start of a line would
            // throw in a classic <script>. `module.exports` is fine: it is
            // guarded by a typeof check for the Node test harness.
            if (/^\s*(export\s+(default|const|function|class|\{)|import\s+[\w{*])/m.test(source)) {
                offenders.push(file);
            }
        }
        assert.deepEqual(offenders, [], "files use module syntax but are loaded as classic scripts");
    });

    test("no accidental debugger statements", () => {
        const offenders = SHIPPED_JS.filter(file => /^\s*debugger\s*;?\s*$/m.test(read(file)));
        assert.deepEqual(offenders, []);
    });
});

suite("Static · referenced files exist", ({ test }) => {
    test("every stylesheet in index.html exists", () => {
        const missing = [];
        for (const match of INDEX.matchAll(/<link[^>]+href="([^"]+)"/g)) {
            const href = match[1].split("?")[0];
            if (/^(https?:)?\/\//.test(href)) continue;
            if (!exists(href)) missing.push(href);
        }
        assert.deepEqual(missing, [], "stylesheets referenced but absent");
    });

    test("every script in index.html exists", () => {
        const missing = [];
        for (const match of INDEX.matchAll(/<script[^>]+src="([^"]+)"/g)) {
            const src = match[1].split("?")[0];
            if (/^(https?:)?\/\//.test(src)) continue;
            if (!exists(src)) missing.push(src);
        }
        assert.deepEqual(missing, [], "scripts referenced but absent");
    });

    test("every url() in shipped CSS resolves", () => {
        const missing = [];
        for (const file of SHIPPED_CSS) {
            const source = read(file);
            const dir = path.posix.dirname(file);
            for (const match of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
                const raw = match[1].trim();
                if (/^(data:|https?:|\/\/)/.test(raw)) continue;
                const resolved = path.posix.normalize(path.posix.join(dir, raw));
                if (!exists(resolved)) missing.push(file + " → " + raw);
            }
        }
        assert.deepEqual(missing, [], "CSS asset paths do not resolve");
    });

    test("asset paths referenced from JavaScript resolve", () => {
        const missing = [];
        for (const file of SHIPPED_JS) {
            const source = read(file);
            // Matches the project's own convention: quoted paths beginning
            // "assets/". Template-built paths are covered by the browser tests.
            for (const match of source.matchAll(/["'`](assets\/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|webp|svg|avif))["'`]/g)) {
                if (!exists(match[1])) missing.push(file + " → " + match[1]);
            }
        }
        assert.deepEqual(missing, [], "JavaScript references missing assets");
    });

    test("asset filenames are lower-case and web-safe", () => {
        // GitHub Pages is case-sensitive; a capital letter that works locally
        // on macOS will 404 once deployed. Only files the page actually
        // requests are checked — documentation sitting beside the artwork is
        // never fetched, so its name does not matter.
        const SERVED = /\.(png|jpe?g|webp|avif|gif|svg|mp3|ogg|wav|m4a|woff2?|ttf|json)$/i;
        const offenders = walk("assets", name => SERVED.test(name))
            .filter(file => !/^[a-z0-9_\-./]+$/.test(file));
        assert.deepEqual(offenders, [], "asset paths contain characters that break case-sensitive hosting");
    });
});

suite("Static · HTML / JavaScript contract", ({ test }) => {
    // The game reads elements with el("id"). If the HTML stops providing one,
    // the symptom is a silent null and a dead feature, so it is worth a test.
    const htmlIds = new Set(
        Array.from(INDEX.matchAll(/\sid="([^"]+)"/g)).map(match => match[1])
    );

    test("index.html has no duplicate element ids", () => {
        const seen = new Set();
        const duplicates = [];
        for (const match of INDEX.matchAll(/\sid="([^"]+)"/g)) {
            if (seen.has(match[1])) duplicates.push(match[1]);
            seen.add(match[1]);
        }
        assert.deepEqual(duplicates, []);
    });

    test("expansion mode panels and mounts are present", () => {
        for (const id of [
            "cityBuilderPanel", "combatPanel", "researchPanel",
            "cityServiceHud", "tutorialCoach"
        ]) {
            assert.ok(htmlIds.has(id), "index.html is missing #" + id);
        }
    });

    test("every expansion mode has a nav tab", () => {
        for (const mode of ["build", "combat", "research"]) {
            assert.includes(INDEX, 'data-mode="' + mode + '"', "no nav tab for mode " + mode);
        }
    });

    test("original gameplay mounts still exist", () => {
        // A regression guard: the expansion must not have removed anything the
        // original game binds to at start-up.
        for (const id of [
            "energyButton", "dispatchButton", "rebirthButton", "stageResetButton",
            "salvage", "scrap", "parts", "circuits", "cores",
            "salvageRate", "scrapRate", "partsRate", "circuitsRate", "coresRate",
            "techUpgrades", "rebirthUpgrades", "preservationPanel",
            "stage2Upgrades", "stage3Upgrades", "stage4Upgrades", "stage5Upgrades",
            "stage2ResetUpgrades", "stage3ResetUpgrades", "stage4ResetUpgrades", "stage5ResetUpgrades",
            "zone1", "zone2", "zone3", "zone4", "zone5",
            "companionPanel", "glyphPanel", "storyPanel", "statsPanel",
            "introModal", "hatchModal", "accountModal", "feedbackModal",
            "saveButton", "resetButton", "soundButton", "notification", "fxLayer"
        ]) {
            assert.ok(htmlIds.has(id), "index.html lost original mount #" + id);
        }
    });

    test("migration.js loads before game.js", () => {
        // defaultGame calls normalizeExpansion() while it is being built, so the
        // order here is load-bearing, not stylistic.
        const migration = INDEX.indexOf("src/game/migration.js");
        const core = INDEX.indexOf("src/game/game.js");
        assert.ok(migration > -1, "migration.js is not loaded");
        assert.ok(core > -1, "game.js is not loaded");
        assert.ok(migration < core, "migration.js must be loaded before game.js");
    });

    test("expansion.js loads after game.js and before its feature modules", () => {
        const core = INDEX.indexOf("src/game/game.js");
        const layer = INDEX.indexOf("src/ui/expansion.js");
        assert.ok(layer > core, "expansion.js must load after game.js");
        for (const feature of [
            "src/game/cinematic.js", "src/game/citybuilder.js", "src/game/combat.js",
            "src/game/research.js", "src/game/companions-plus.js", "src/game/events.js"
        ]) {
            const at = INDEX.indexOf(feature);
            assert.ok(at > -1, feature + " is not loaded");
            assert.ok(at > layer, feature + " must load after expansion.js so it has a namespace to register into");
        }
    });
});

suite("Static · deployment hygiene", ({ test }) => {
    test("no secret-looking keys are committed", () => {
        // The publishable Supabase key is safe to ship by design — it is meant
        // to sit in client code. A service_role key, a secret key or a private
        // key never is, so those fail the build.
        //
        // Comments are stripped first: cloud-config.js carries the warning
        // "Never put a secret/service_role key here", which is exactly the
        // right thing for it to say and must not be read as a violation.
        const stripComments = source => source
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
            .replace(/<!--[\s\S]*?-->/g, " ");

        const offenders = [];
        for (const file of [...SHIPPED_JS, "index.html"]) {
            const code = stripComments(read(file));
            if (/service_role/i.test(code)) offenders.push(file + ": service_role");
            if (/sb_secret_/.test(code)) offenders.push(file + ": sb_secret key");
            if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(read(file))) offenders.push(file + ": private key");
            // A JWT whose payload decodes to a service_role claim.
            for (const match of code.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)) {
                let payload = "";
                try { payload = Buffer.from(match[1], "base64").toString("utf8"); } catch (_) {}
                if (/service_role/.test(payload)) offenders.push(file + ": service_role JWT");
            }
        }
        assert.deepEqual(offenders, [], "possible secrets committed");
    });

    test("no absolute local filesystem paths leaked into shipped files", () => {
        const offenders = [];
        for (const file of [...SHIPPED_JS, ...SHIPPED_CSS, "index.html"]) {
            if (/\/home\/claude|[A-Z]:\\Users\\/.test(read(file))) offenders.push(file);
        }
        assert.deepEqual(offenders, []);
    });

    test("page works from a subdirectory (no root-absolute asset paths)", () => {
        // GitHub Pages serves project sites from /<repo>/, so a leading slash
        // in a src/href would break every asset on the deployed site.
        const offenders = [];
        for (const match of INDEX.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)) {
            offenders.push(match[1]);
        }
        assert.deepEqual(offenders, [], "root-absolute paths break project-site hosting");
    });
});
