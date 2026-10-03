const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
// A business conflict must return once; serialization_failure can spin inside PostgREST 14.
const setupSql = fs.readFileSync(path.join(root, "supabase", "setup.sql"), "utf8");
assert.match(setupSql, /raise sqlstate 'PT409' using message = 'SAVE_CONFLICT'/i);
assert.doesNotMatch(setupSql, /(?:errcode\s*=|raise\s+sqlstate)\s*'40001'/i);
const GUEST = "lastCitySaveV2";
const accountKey = id => `${GUEST}:account:${id}`;
const city = salvage => ({ salvage, buildings: { scavenger: 0 }, lastSeen: Date.now() });
const row = (salvage, revision) => ({ state: city(salvage), schema_version: 2, revision, updated_at: new Date().toISOString() });
const session = id => ({ user: { id, email: `${id}@example.com` } });
const clone = value => JSON.parse(JSON.stringify(value));

async function harness({ user = null, cloud = [], cache = [], configured = true, hash = "" } = {}) {
    const storage = new Map(cache);
    const rows = new Map(cloud);
    const nodes = new Map();
    const timers = [];
    const intervals = [];
    const windowEvents = new Map();
    let state = city(0), authCallback, currentSession = user ? session(user) : null;
    const controls = { offline: false, uploads: 0, afterUpload: null, reads: 0, requests: [], authRequests: [], signupError: null, signupWait: null, loginError: null, googleEnabled: true, oauthError: null, oauthWait: null, settingsRequests: 0, settingsStatus: 200 };
    function node(id) {
        if (!nodes.has(id)) nodes.set(id, {
            hidden: false, open: false, value: "", disabled: false, dataset: {}, textContent: "",
            listeners: new Map(),
            addEventListener(name, fn) { this.listeners.set(name, fn); },
            showModal() { this.open = true; }, close() { this.open = false; },
            focus() { controls.focused = id; },
            checkValidity() { return id !== "accountEmail" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value); },
            querySelector() { return node(`${id}:submit`); },
            reportValidity() { return true; }
        });
        return nodes.get(id);
    }
    const main = { inert: false };
    const client = {
        auth: {
            onAuthStateChange(fn) { authCallback = fn; },
            async getSession() { return { data: { session: currentSession }, error: null }; },
            async signOut() { currentSession = null; authCallback("SIGNED_OUT", null); return { error: null }; },
            async resetPasswordForEmail() { return { error: null }; },
            async updateUser() { return { error: null }; },
            async signInWithOAuth(args) {
                controls.authRequests.push({ action: "google", ...args });
                if (controls.oauthWait) await controls.oauthWait;
                return { data: { url: "https://test.supabase.co/auth/v1/authorize?provider=google" }, error: controls.oauthError };
            },
            async signUp(args) {
                controls.authRequests.push({ action: "signup", ...args });
                if (controls.signupWait) await controls.signupWait;
                return { data: { session: null }, error: controls.signupError };
            },
            async signInWithPassword(args) { controls.authRequests.push({ action: "login", ...args }); return { data: {}, error: controls.loginError || { message: "Invalid login credentials" } }; }
        },
        from(table) {
            assert.equal(table, "city_saves");
            return { select() { return { eq(column, id) {
                assert.equal(column, "user_id");
                assert.equal(id, currentSession.user.id);
                return { async maybeSingle() {
                    controls.reads++;
                    if (controls.offline) throw new Error("Network offline");
                    return { data: rows.has(id) ? clone(rows.get(id)) : null, error: null };
                } };
            } }; } };
        },
        async rpc(name, args) {
            assert.equal(name, "save_city");
            const id = currentSession.user.id;
            assert.equal(args.p_user_id, id, "Every upload specifies its owning player, checked against the session in SQL");
            controls.requests.push({ id, ...clone(args) });
            if (controls.offline) throw new Error("Network offline");
            const existing = rows.get(id);
            if ((existing?.revision || 0) !== args.p_expected_revision) return { data: null, error: { code: "PT409", message: "SAVE_CONFLICT" } };
            const next = row(args.p_state.salvage, (existing?.revision || 0) + 1);
            next.state = clone(args.p_state);
            rows.set(id, next);
            controls.uploads++;
            if (controls.afterUpload) { const callback = controls.afterUpload; controls.afterUpload = null; callback(); }
            return { data: [{ revision: next.revision, updated_at: next.updated_at }], error: null };
        }
    };
    const window = {
        LAST_CITY_CLOUD_CONFIG: configured ? { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "sb_publishable_test" } : {},
        supabase: { createClient: () => client },
        location: { pathname: "/ctrl-alt-defeat-last-city/", origin: "https://ctrl-alt-defeat-last-city.github.io", hash, assign(url) { controls.redirect = url; } },
        confirm: () => true,
        addEventListener(name, fn) { windowEvents.set(name, fn); },
        LastCityGame: {
            snapshot: () => clone(state),
            load(snapshot) { state = snapshot ? JSON.parse(snapshot) : city(0); },
            saveLocal() {
                state.lastSeen = Date.now();
                storage.set(window.LastCityCloud?.getSaveKey() || GUEST, JSON.stringify(state));
                window.LastCityCloud?.onSave(false);
            }
        }
    };
    if (storage.has(GUEST)) state = JSON.parse(storage.get(GUEST));
    const context = vm.createContext({
        window, console, Date, URL, URLSearchParams, AbortController,
        clearTimeout() {},
        async fetch(url, options) {
            assert.equal(url, "https://test.supabase.co/auth/v1/settings");
            assert.equal(options.headers.apikey, "sb_publishable_test");
            controls.settingsRequests++;
            if (controls.offline) throw new Error("Network offline");
            return { ok: controls.settingsStatus === 200, status: controls.settingsStatus, async json() { return { external: { google: controls.googleEnabled } }; } };
        },
        setTimeout(fn, delay) { if (delay === 0) timers.push(fn); },
        setInterval(fn) { intervals.push(fn); },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        document: { getElementById: node, querySelector: selector => selector === "main" ? main : null, addEventListener() {} }
    });
    vm.runInContext(fs.readFileSync(path.join(root, "cloud-save.js"), "utf8"), context);
    async function flush() {
        for (let i = 0; i < 35; i++) {
            while (timers.length) timers.shift()();
            await new Promise(resolve => setImmediate(resolve));
        }
    }
    await flush();
    return {
        window, storage, rows, controls, nodes, flush, city: () => state,
        savedMeta: id => JSON.parse(storage.get(`${accountKey(id)}:sync`) || "{}"),
        async click(id) { await node(id).listeners.get("click")?.(); await flush(); },
        async submit(id) { await node(id).listeners.get("submit")?.({ preventDefault() {} }); await flush(); },
        fill(email, password) { node("accountEmail").value = email; node("accountPassword").value = password; },
        async changeUser(id, event = "SIGNED_IN") { currentSession = id ? session(id) : null; authCallback(event, currentSession); await flush(); },
        async save(salvage, manual = true) { state.salvage = salvage; window.LastCityGame.saveLocal(); window.LastCityCloud.onSave(manual); await flush(); },
        async interval() { intervals.forEach(fn => fn()); await flush(); },
        async pageShow(persisted) { windowEvents.get("pageshow")({ persisted }); await flush(); },
        async storageEvent(key) { windowEvents.get("storage")({ key }); await flush(); }
    };
}

(async () => {
    let h = await harness({ configured: false, cache: [[GUEST, JSON.stringify(city(77))]] });
    assert.equal(h.window.LastCityCloud.getSaveKey(), GUEST);
    await h.save(88);
    assert.equal(JSON.parse(h.storage.get(GUEST)).salvage, 88);
    assert.equal(h.controls.uploads, 0);

    h = await harness();
    await h.click("signupButton");
    assert.equal(h.nodes.get("accountMessage").textContent, "Enter your email address first.");
    assert.equal(h.controls.authRequests.length, 0);
    h.fill("not-an-email", "ValidTestPassword");
    await h.click("signupButton");
    assert.match(h.nodes.get("accountMessage").textContent, /valid email/);
    h.fill("test@example.com", "");
    await h.click("signupButton");
    assert.equal(h.nodes.get("accountMessage").textContent, "Enter your password first.");
    h.fill("test@example.com", "short");
    await h.click("signupButton");
    assert.match(h.nodes.get("accountMessage").textContent, /at least 8/);
    assert.equal(h.controls.authRequests.length, 0, "Invalid fields must not trigger a signup request");
    let completeSignup;
    h.controls.signupWait = new Promise(resolve => { completeSignup = resolve; });
    h.fill(" test@example.com ", "ValidTestPassword");
    await h.click("signupButton");
    assert.equal(h.nodes.get("signupButton").textContent, "Creating account…");
    assert.equal(h.nodes.get("signupButton").disabled, true);
    await h.click("signupButton");
    assert.equal(h.controls.authRequests.length, 1, "A double click cannot send a duplicate signup");
    assert.equal(h.controls.authRequests[0].email, "test@example.com");
    assert.equal(h.controls.authRequests[0].options.emailRedirectTo, "https://ctrl-alt-defeat-last-city.github.io/ctrl-alt-defeat-last-city/");
    completeSignup();
    await h.flush();
    assert.match(h.nodes.get("accountMessage").textContent, /Check your email/);
    assert.equal(h.nodes.get("signupButton").textContent, "Create account");
    assert.equal(h.nodes.get("signupButton").disabled, false);
    h.controls.signupWait = null;
    h.controls.signupError = { code: "email_address_not_authorized", message: "Email address not authorized" };
    h.fill("test@example.com", "ValidTestPassword");
    await h.click("signupButton");
    assert.match(h.nodes.get("accountMessage").textContent, /configure email delivery/);
    assert.equal(h.nodes.get("signupButton").disabled, false);
    h.fill("test@example.com", "legacy");
    await h.submit("accountForm");
    assert.equal(h.controls.authRequests.at(-1).action, "login", "Existing passwords must not be blocked by the signup length rule");
    assert.equal(h.nodes.get("accountMessage").textContent, "Invalid login credentials");
    h.controls.loginError = { name: "AuthRetryableFetchError", message: "Failed to fetch" };
    await h.submit("accountForm");
    assert.match(h.nodes.get("accountMessage").textContent, /Cannot reach the account service/);
    assert.equal(h.nodes.get("loginButton").disabled, false, "An unavailable login service must leave the form usable");
    console.log("Passed: inline signup validation, whitespace trimming, visible pending state, duplicate-submit prevention, confirmation instructions, SMTP errors and login submission.");

    h = await harness({ cache: [[GUEST, JSON.stringify(city(123))]] });
    h.controls.settingsStatus = 521;
    await h.click("googleLoginButton");
    assert.match(h.nodes.get("accountMessage").textContent, /account service is unavailable/);
    assert.equal(h.controls.authRequests.length, 0, "An unavailable Auth service must not start a failed redirect");
    assert.equal(h.controls.redirect, undefined);
    assert.equal(h.nodes.get("googleLoginButton").disabled, false);
    assert.equal(JSON.parse(h.storage.get(GUEST)).salvage, 123, "Connection failures preserve the guest city");
    h.controls.settingsStatus = 200;
    h.controls.googleEnabled = false;
    await h.click("googleLoginButton");
    assert.match(h.nodes.get("accountMessage").textContent, /not enabled yet/);
    assert.equal(h.controls.redirect, undefined, "Disabled providers show an inline message instead of leaving the game");
    assert.equal(h.nodes.get("googleLoginButton").disabled, false);
    h.controls.googleEnabled = true;
    h.controls.oauthError = { message: "OAuth temporarily unavailable" };
    await h.click("googleLoginButton");
    assert.equal(h.nodes.get("accountMessage").textContent, "OAuth temporarily unavailable");
    assert.equal(h.nodes.get("googleLoginLabel").textContent, "Continue with Google");
    h.controls.oauthError = null;
    h.controls.offline = true;
    await h.click("googleLoginButton");
    assert.equal(h.nodes.get("googleLoginButton").disabled, false);
    assert.equal(h.controls.redirect, undefined);
    h.controls.offline = false;
    let completeOAuth;
    h.controls.oauthWait = new Promise(resolve => { completeOAuth = resolve; });
    await h.click("googleLoginButton");
    assert.equal(h.nodes.get("googleLoginLabel").textContent, "Connecting to Google…");
    assert.equal(h.nodes.get("signupButton").disabled, true);
    const requests = h.controls.authRequests.length;
    await h.click("googleLoginButton");
    assert.equal(h.controls.authRequests.length, requests, "Duplicate Google clicks cannot start two redirects");
    const oauth = h.controls.authRequests.at(-1);
    assert.equal(oauth.provider, "google");
    assert.equal(oauth.options.redirectTo, "https://ctrl-alt-defeat-last-city.github.io/ctrl-alt-defeat-last-city/");
    assert.equal(oauth.options.queryParams.prompt, "select_account");
    assert.equal(oauth.options.skipBrowserRedirect, true);
    assert.equal(JSON.parse(h.storage.get(GUEST)).salvage, 123, "Guest progress is saved before navigating to Google");
    completeOAuth();
    await h.flush();
    assert.match(h.controls.redirect, /provider=google/);
    await h.pageShow(true);
    assert.equal(h.nodes.get("googleLoginButton").disabled, false, "Back from Google's screen restores a usable login button");
    // Supabase restores the returned OAuth session through the same auth listener.
    h.rows.set("google-player", row(678, 2));
    await h.changeUser("google-player");
    assert.equal(h.city().salvage, 678);
    assert.equal(JSON.parse(h.storage.get(GUEST)).salvage, 123);
    await h.save(789);
    assert.equal(h.rows.get("google-player").state.salvage, 789);
    h = await harness({ hash: "#error=access_denied&error_description=Cancelled" });
    assert.equal(h.nodes.get("accountModal").open, true);
    assert.match(h.nodes.get("accountMessage").textContent, /cancelled or denied/);
    console.log("Passed: Google provider checks, OAuth failure/retry, empty-form sign-in, duplicate-click prevention, guest save before redirect, correct return URL, returned-session cloud restore/sync and cancelled-login feedback.");

    h = await harness({ user: "alice", cloud: [["alice", row(500, 4)]], cache: [[GUEST, JSON.stringify(city(77))]] });
    assert.equal(h.city().salvage, 500, "A fresh device loads the cloud without a false conflict");
    assert.equal(h.nodes.get("saveConflictPanel").hidden, true);
    assert.equal(JSON.parse(h.storage.get(GUEST)).salvage, 77, "Signing in keeps guest progress");
    await h.save(600);
    assert.equal(h.rows.get("alice").state.salvage, 600);
    await h.click("logoutButton");
    assert.equal(h.city().salvage, 77, "Logging out restores the separate guest city");
    await h.changeUser("bob");
    assert.equal(h.city().salvage, 0, "A new account cannot inherit the previous player's save");
    await h.click("importGuestButton");
    assert.equal(h.rows.get("bob").state.salvage, 77);
    assert.equal(h.rows.get("alice").state.salvage, 600);

    h = await harness({ user: "alice", cloud: [["alice", row(900, 5)]], cache: [
        [accountKey("alice"), JSON.stringify(city(800))],
        [`${accountKey("alice")}:sync`, JSON.stringify({ revision: 4, pending: true })]
    ] });
    assert.equal(h.controls.uploads, 0, "Divergent pending saves never auto overwrite the cloud");
    assert.equal(h.city().salvage, 800);
    await h.click("useCloudSaveButton");
    assert.equal(h.city().salvage, 900);
    assert.ok([...h.storage.keys()].some(key => key.includes(":backup:")));

    await h.save(950, false);
    h.rows.set("alice", row(1200, h.rows.get("alice").revision + 1));
    await h.click("cloudSyncButton");
    assert.equal(h.rows.get("alice").state.salvage, 1200, "Atomic revision checks protect another device's city");
    await h.click("useDeviceSaveButton");
    assert.equal(h.rows.get("alice").state.salvage, 950, "Explicit conflict choice can keep device progress");

    h.controls.offline = true;
    await h.save(1000);
    assert.equal(h.savedMeta("alice").pending, true);
    assert.equal(h.rows.get("alice").state.salvage, 950);
    h.controls.offline = false;
    await h.click("cloudSyncButton");
    assert.equal(h.rows.get("alice").state.salvage, 1000);
    assert.equal(h.savedMeta("alice").pending, false);

    h.controls.afterUpload = () => { h.city().salvage = 1100; h.window.LastCityGame.saveLocal(); };
    await h.save(1050);
    assert.equal(h.savedMeta("alice").pending, true, "Progress during an upload remains pending");
    await h.interval();
    assert.equal(h.rows.get("alice").state.salvage, 1100);

    const before = h.controls.uploads;
    await h.storageEvent(accountKey("alice"));
    await h.interval();
    assert.equal(h.controls.uploads, before, "Other-tab changes pause autosync");
    await h.click("cloudSyncButton");
    assert.equal(h.nodes.get("saveConflictPanel").hidden, false);
    await h.click("useDeviceSaveButton");
    assert.equal(h.savedMeta("alice").pending, false);

    await h.changeUser("alice", "PASSWORD_RECOVERY");
    assert.equal(h.nodes.get("recoveryForm").hidden, false);
    assert.equal(h.nodes.get("accountModal").open, true);
    h = await harness({ user: "alice", cloud: [["alice", row(200, 2)]], cache: [
        [GUEST, JSON.stringify(city(777))], [accountKey("alice"), "broken JSON"]
    ] });
    assert.equal(h.city().salvage, 200, "A corrupt account cache must never keep the guest player's city in memory");
    assert.ok([...h.storage.keys()].some(key => key.includes(":invalid-cache")));
    await h.click("cloudSyncButton");
    assert.equal(h.city().salvage, 200, "A damaged cache can be replaced by its account's cloud city");
    console.log("Passed: guest fallback, cloud restore on new devices, account isolation, guest import, conflict choices/backups, atomic revisions, offline retry, in-flight progress, other-tab protection and password recovery routing.");
})().catch(error => { console.error(error); process.exitCode = 1; });
