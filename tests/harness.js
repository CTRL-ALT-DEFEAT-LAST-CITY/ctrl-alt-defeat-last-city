// =============================================
// LAST CITY · MINIMAL TEST HARNESS
// ---------------------------------------------
// Deliberately dependency-free. `node tests/run.js` works on a clean checkout
// with nothing installed, because the shipped game has no dependencies and the
// tests should not introduce any either.
//
// The only optional extra is Playwright, used by tests/browser.test.js. When it
// is absent those tests report as SKIPPED rather than failing, so the suite
// still gives a useful signal on a machine without it.
// =============================================

"use strict";

const suites = [];

// Per-test ceiling. Generous enough for a browser test that boots a page and
// drives it, short enough that a deadlock is reported rather than waited on.
const TEST_TIMEOUT_MS = Number(process.env.LASTCITY_TEST_TIMEOUT_MS) || 45000;

function suite(name, register) {
    const tests = [];
    const context = {
        test(testName, fn) { tests.push({ name: testName, fn }); },
        // Marks a test as expected-to-skip with a stated reason, which shows up
        // in the report instead of being silently omitted.
        skip(testName, reason) { tests.push({ name: testName, skip: reason || "skipped" }); }
    };
    register(context);
    suites.push({ name, tests });
}

class AssertionError extends Error {}

function fail(message) { throw new AssertionError(message); }

const assert = {
    ok(value, message) {
        if (!value) fail(message || "expected a truthy value, got " + describe(value));
    },
    notOk(value, message) {
        if (value) fail(message || "expected a falsy value, got " + describe(value));
    },
    equal(actual, expected, message) {
        if (actual !== expected) {
            fail((message ? message + " — " : "") + "expected " + describe(expected) + ", got " + describe(actual));
        }
    },
    notEqual(actual, expected, message) {
        if (actual === expected) {
            fail((message ? message + " — " : "") + "expected a value other than " + describe(expected));
        }
    },
    // Float comparison for economy maths, where exact equality is the wrong test.
    close(actual, expected, tolerance, message) {
        const limit = tolerance ?? 1e-9;
        if (!Number.isFinite(actual) || Math.abs(actual - expected) > limit) {
            fail((message ? message + " — " : "") + "expected " + expected + " ±" + limit + ", got " + actual);
        }
    },
    deepEqual(actual, expected, message) {
        const a = JSON.stringify(actual), b = JSON.stringify(expected);
        if (a !== b) fail((message ? message + " — " : "") + "expected " + b + ", got " + a);
    },
    throws(fn, message) {
        let threw = false;
        try { fn(); } catch (_) { threw = true; }
        if (!threw) fail(message || "expected the call to throw");
    },
    // Asserts a number is finite and inside a range. Used heavily on the
    // economy, where NaN or Infinity leaking into a rate is the real risk.
    inRange(actual, min, max, message) {
        if (!Number.isFinite(actual) || actual < min || actual > max) {
            fail((message ? message + " — " : "") + "expected a finite value in [" + min + ", " + max + "], got " + describe(actual));
        }
    },
    finite(actual, message) {
        if (!Number.isFinite(actual)) {
            fail((message ? message + " — " : "") + "expected a finite number, got " + describe(actual));
        }
    },
    includes(haystack, needle, message) {
        const has = typeof haystack === "string"
            ? haystack.includes(needle)
            : Array.isArray(haystack) && haystack.includes(needle);
        if (!has) fail((message ? message + " — " : "") + "expected to find " + describe(needle));
    }
};

function describe(value) {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
    if (value === undefined) return "undefined";
    try { return JSON.stringify(value).slice(0, 200); } catch (_) { return String(value); }
}

async function run() {
    const results = { passed: 0, failed: 0, skipped: 0, failures: [], suites: [] };
    const bold = s => "\u001b[1m" + s + "\u001b[0m";
    const green = s => "\u001b[32m" + s + "\u001b[0m";
    const red = s => "\u001b[31m" + s + "\u001b[0m";
    const grey = s => "\u001b[90m" + s + "\u001b[0m";

    for (const item of suites) {
        console.log("\n" + bold(item.name));
        const summary = { name: item.name, passed: 0, failed: 0, skipped: 0 };
        for (const entry of item.tests) {
            if (entry.skip) {
                results.skipped++; summary.skipped++;
                console.log("  " + grey("○ " + entry.name + " — " + entry.skip));
                continue;
            }
            try {
                // A hung test must fail, not stall the whole run. Browser tests
                // in particular can wait forever on a condition that will never
                // become true.
                await Promise.race([
                    entry.fn(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new AssertionError("timed out after " + (TEST_TIMEOUT_MS / 1000) + "s")), TEST_TIMEOUT_MS))
                ]);
                results.passed++; summary.passed++;
                console.log("  " + green("✓") + " " + entry.name);
            } catch (error) {
                results.failed++; summary.failed++;
                const detail = error instanceof AssertionError
                    ? error.message
                    : (error && error.stack ? error.stack.split("\n").slice(0, 4).join("\n      ") : String(error));
                results.failures.push({ suite: item.name, test: entry.name, detail });
                console.log("  " + red("✗") + " " + entry.name);
                console.log("      " + red(detail));
            }
        }
        results.suites.push(summary);
    }

    console.log("\n" + bold("─".repeat(58)));
    console.log(bold("  " + results.passed + " passed") +
        (results.failed ? red("   " + results.failed + " failed") : "") +
        (results.skipped ? grey("   " + results.skipped + " skipped") : ""));
    console.log(bold("─".repeat(58)) + "\n");

    return results;
}

module.exports = { suite, assert, run, fail, AssertionError };
