#!/usr/bin/env node
// =============================================
// LAST CITY · TEST RUNNER
// ---------------------------------------------
//   node tests/run.js                 run everything available
//   node tests/run.js --no-browser    static + unit tests only
//   node tests/run.js --only=static   run one suite file
//
// Exit code 0 means every test that ran, passed. Skipped tests (for example
// the browser suite on a machine with no Playwright) do not fail the run, but
// they are counted and reported so a green result is never misleading.
// =============================================

"use strict";

const path = require("path");
const harness = require("./harness");

const args = process.argv.slice(2);
const noBrowser = args.includes("--no-browser");
const only = (args.find(arg => arg.startsWith("--only=")) || "").split("=")[1];

const FILES = [
    { key: "static", file: "./static.test.js" },
    { key: "unit",   file: "./unit.test.js" },
    { key: "browser", file: "./browser.test.js", browser: true }
];

(async () => {
    console.log("\n\u001b[1mLAST CITY · test suite\u001b[0m");
    console.log("node " + process.version + " · " + new Date().toISOString());

    for (const entry of FILES) {
        if (only && entry.key !== only) continue;
        if (entry.browser && noBrowser) {
            console.log("\u001b[90m  (skipping browser suite: --no-browser)\u001b[0m");
            continue;
        }
        try {
            require(path.resolve(__dirname, entry.file));
        } catch (error) {
            console.error("\u001b[31mCould not load " + entry.file + ":\u001b[0m", error.message);
            process.exitCode = 1;
        }
    }

    const results = await harness.run();

    if (results.failures.length) {
        console.log("\u001b[1mFailures\u001b[0m");
        for (const failure of results.failures) {
            console.log("  • [" + failure.suite + "] " + failure.test);
        }
        console.log("");
    }

    // Machine-readable summary, so TEST_RESULTS.md can be regenerated from a
    // real run rather than written from memory.
    if (args.includes("--json")) {
        console.log("JSON_SUMMARY " + JSON.stringify({
            passed: results.passed,
            failed: results.failed,
            skipped: results.skipped,
            suites: results.suites
        }));
    }

    process.exitCode = results.failed > 0 ? 1 : (process.exitCode || 0);
})().catch(error => {
    console.error("\u001b[31mTest runner crashed:\u001b[0m", error);
    process.exitCode = 1;
});
